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

commit;
