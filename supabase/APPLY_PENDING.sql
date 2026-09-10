-- =============================================================================
-- Migrações pendentes 20260908000002..000006 + 20260909000001 consolidadas.
-- Rode UMA vez no SQL Editor do Supabase. Seguro re-rodar.
-- =============================================================================
begin;

-- 000002 — recurrences.day = 0 significa "último dia do mês"
alter table public.recurrences drop constraint if exists recurrences_day_check;
alter table public.recurrences
  add constraint recurrences_day_check check (day between 0 and 31);
comment on column public.recurrences.day is '1-31 = dia fixo do mês; 0 = último dia do mês';

-- 000003 — recurrences.variable_amount (valor muda mês a mês)
alter table public.recurrences
  add column if not exists variable_amount boolean not null default false;
comment on column public.recurrences.variable_amount is 'true = valor muda mês a mês; pede confirmação do valor na baixa';
comment on column public.recurrences.autopay is 'informativo: fixo em débito automático; o pagamento ainda é marcado manualmente';

-- 000006 — recurrences.shared (pagamento é gasto compartilhado)
alter table public.recurrences
  add column if not exists shared boolean not null default false;
comment on column public.recurrences.shared is 'true = ao pagar, divide igualmente entre os membros (transaction_splits)';

-- 000004 — backfill de profiles.email a partir de auth.users
update public.profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and (p.email is null or p.email = '')
   and u.email is not null;

-- 000005 — RPC de convite por e-mail (versão robusta)
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_name text;
  v_mail text := lower(trim(p_email));
begin
  select id into v_id from public.profiles where lower(email) = v_mail limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select u.id,
         coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name',
           split_part(u.email, '@', 1)
         )
    into v_id, v_name
    from auth.users u
   where lower(u.email) = v_mail
   limit 1;

  if v_id is not null then
    insert into public.profiles (id, name, email)
    values (v_id, coalesce(v_name, ''), v_mail)
    on conflict (id) do update set email = excluded.email;
  end if;

  return v_id;
end;
$$;

revoke all on function public.find_user_id_by_email(text) from public, anon;
grant execute on function public.find_user_id_by_email(text) to authenticated;

-- 20260909000001 — recurrences: parcelamento / empréstimo
alter table public.recurrences
  add column if not exists installments_total smallint,
  add column if not exists installments_done  smallint not null default 0;
alter table public.recurrences drop constraint if exists recurrences_installments_chk;
alter table public.recurrences
  add constraint recurrences_installments_chk
  check (
    (installments_total is null)
    or (installments_total >= 1 and installments_done >= 0 and installments_done < installments_total)
  );
comment on column public.recurrences.installments_total is 'total de parcelas do empréstimo/parcelamento; null = recorrência sem fim';
comment on column public.recurrences.installments_done  is 'parcelas já pagas antes do cadastro (empréstimo em andamento)';

-- 20260910000001 — criação de carteira num RPC atômico
-- (corrige "new row violates row-level security policy for table wallets")
create or replace function public.create_wallet(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  w   uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.wallets (name, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'Nova carteira'), uid)
  returning id into w;

  insert into public.wallet_members (wallet_id, user_id, role)
  values (w, uid, 'owner');

  perform public.seed_wallet(w);

  return w;
end;
$$;

grant execute on function public.create_wallet(text) to authenticated;

-- 20260910000002 — gasto fixo contado duas vezes (dedupe + índice único)
with ranked as (
  select id,
         row_number() over (
           partition by recurrence_id, date
           order by (status = 'cleared') desc, created_at asc
         ) as rn
  from public.transactions
  where recurrence_id is not null
)
delete from public.transactions t
using ranked r
where t.id = r.id and r.rn > 1;

create unique index if not exists transactions_recurrence_occurrence_uniq
  on public.transactions (recurrence_id, date)
  where recurrence_id is not null;

-- 20260910000003 — âncora estável da ocorrência (occ_month/occ_year); `date` passa
-- a ser o dia real da baixa (corrige salário recebido antes do vencimento sumindo)
alter table public.transactions
  add column if not exists occ_month smallint,
  add column if not exists occ_year  smallint;

update public.transactions
   set occ_month = extract(month from date)::smallint,
       occ_year  = extract(year  from date)::smallint
 where recurrence_id is not null and occ_month is null;

with ranked as (
  select id,
         row_number() over (
           partition by recurrence_id, occ_year, occ_month
           order by (status = 'cleared') desc, created_at asc
         ) as rn
  from public.transactions
  where recurrence_id is not null
)
delete from public.transactions t using ranked r
where t.id = r.id and r.rn > 1;

drop index if exists transactions_recurrence_occurrence_uniq;
create unique index transactions_recurrence_occurrence_uniq
  on public.transactions (recurrence_id, occ_year, occ_month)
  where recurrence_id is not null;

-- 20260910000004 — limites rígidos: sem estourar o limite do cartão e sem
-- deixar conta de dinheiro negativa (enforçado por trigger). Escape hatch:
-- set local carewallet.skip_checks = 'on'.
create or replace function public.enforce_spend_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acc         public.accounts;
  v_committed bigint;
  v_balance   bigint;
begin
  if coalesce(current_setting('carewallet.skip_checks', true), '') = 'on' then
    return new;
  end if;
  if new.status <> 'cleared' then
    return new;
  end if;
  if not (
    tg_op = 'INSERT'
    or new.amount_cents > old.amount_cents
    or new.account_id  <> old.account_id
    or old.status <> 'cleared'
  ) then
    return new;
  end if;

  select * into acc from public.accounts where id = new.account_id;
  if not found then
    return new;
  end if;

  if acc.kind = 'card' and new.kind = 'expense' and acc.credit_limit_cents is not null then
    select coalesce(sum(t.amount_cents), 0) into v_committed
      from public.transactions t
      join public.card_invoices ci on ci.id = t.card_invoice_id
     where t.account_id = new.account_id
       and t.kind = 'expense'
       and ci.status <> 'paid'
       and t.id <> new.id;
    if v_committed + new.amount_cents > acc.credit_limit_cents then
      raise exception 'Limite do cartão % excedido — livre: R$ %.',
        acc.name, round((acc.credit_limit_cents - v_committed) / 100.0, 2)
        using errcode = '23514';
    end if;
  end if;

  if acc.kind <> 'card' and new.kind in ('expense', 'transfer') then
    select acc.opening_balance_cents
         + coalesce(sum(case when t.kind = 'income' then t.amount_cents else -t.amount_cents end), 0)
      into v_balance
      from public.transactions t
     where t.account_id = new.account_id
       and t.status = 'cleared'
       and t.id <> new.id;
    if v_balance - new.amount_cents < 0 then
      raise exception 'Saldo insuficiente em % — disponível: R$ %.',
        acc.name, round(v_balance / 100.0, 2)
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transactions_spend_limits on public.transactions;
create trigger trg_transactions_spend_limits
  before insert or update on public.transactions
  for each row execute function public.enforce_spend_limits();

-- 20260910000005 — "gasto compartilhado" vira marcador ("foi dos dois juntos"),
-- não gera mais divisão automática (acerto de contas fica como feature separada)
alter table public.transactions
  add column if not exists shared boolean not null default false;
update public.transactions
   set shared = true
 where shared = false
   and id in (select distinct transaction_id from public.transaction_splits);
delete from public.transaction_splits;

-- 20260910000006 — onboarding no cadastro não derruba o signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_wallet uuid;
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  on conflict (id) do update set email = coalesce(excluded.email, public.profiles.email);

  begin
    insert into public.wallets (name, created_by)
    values ('Minha Carteira', new.id)
    returning id into new_wallet;
    insert into public.wallet_members (wallet_id, user_id, role)
    values (new_wallet, new.id, 'owner');
    perform public.seed_wallet(new_wallet);
  exception when others then
    raise warning 'handle_new_user: falha no onboarding de % — %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

commit;
