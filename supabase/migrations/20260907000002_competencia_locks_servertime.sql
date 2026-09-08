-- =============================================================================
-- FinanceApp — competência, travas de período e hora do servidor
-- =============================================================================
-- A) transactions ganha período de referência (ref_month/ref_year) separado de `date`
--    - date     = regime de caixa (quando o dinheiro se move; bate com o banco)
--    - ref_*    = regime de competência (a que mês o gasto/receita "pertence")
--      * cartão: ref = mês/ano da FATURA (resolveInvoiceRef), não da compra
--      * demais: ref = mês/ano de `date`, mas pode ser sobrescrito manualmente
-- B) card_invoices.status ganha 'closed'; period_locks trava meses inteiros
--    (enforçado por trigger no Postgres, não só no app)
-- C) app_now()/app_today() — data corrente vinda do servidor (America/Sao_Paulo)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A) Período de referência (competência)
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists ref_month smallint,
  add column if not exists ref_year  smallint;

-- backfill: por padrão, competência = mês/ano da data
update public.transactions
   set ref_month = extract(month from date)::smallint,
       ref_year  = extract(year  from date)::smallint
 where ref_month is null;

-- cartão: competência = mês/ano da fatura a que a transação pertence
update public.transactions t
   set ref_month = ci.ref_month,
       ref_year  = ci.ref_year
  from public.card_invoices ci
 where t.card_invoice_id = ci.id;

alter table public.transactions
  alter column ref_month set not null,
  alter column ref_year  set not null;

alter table public.transactions
  drop constraint if exists transactions_ref_month_check;
alter table public.transactions
  add constraint transactions_ref_month_check check (ref_month between 1 and 12);

create index if not exists transactions_wallet_ref_idx
  on public.transactions (wallet_id, ref_year, ref_month);

-- ---------------------------------------------------------------------------
-- B1) Ciclo de vida da fatura: open -> closed -> paid
-- ---------------------------------------------------------------------------
alter table public.card_invoices
  drop constraint if exists card_invoices_status_check;
alter table public.card_invoices
  add constraint card_invoices_status_check
  check (status in ('open', 'closed', 'paid'));

-- ---------------------------------------------------------------------------
-- B2) Travas de mês por carteira
-- ---------------------------------------------------------------------------
create table if not exists public.period_locks (
  wallet_id  uuid not null references public.wallets (id) on delete cascade,
  ref_year   smallint not null,
  ref_month  smallint not null check (ref_month between 1 and 12),
  locked_by  uuid references public.profiles (id) on delete set null,
  locked_at  timestamptz not null default now(),
  primary key (wallet_id, ref_year, ref_month)
);

alter table public.period_locks enable row level security;

drop policy if exists period_locks_read on public.period_locks;
create policy period_locks_read on public.period_locks
  for select using (public.is_wallet_member(wallet_id));

drop policy if exists period_locks_owner_write on public.period_locks;
create policy period_locks_owner_write on public.period_locks
  for all using (
    exists (select 1 from public.wallet_members m
            where m.wallet_id = period_locks.wallet_id
              and m.user_id = auth.uid() and m.role = 'owner')
  ) with check (
    exists (select 1 from public.wallet_members m
            where m.wallet_id = period_locks.wallet_id
              and m.user_id = auth.uid() and m.role = 'owner')
  );

-- ---------------------------------------------------------------------------
-- B3) Enforcement: bloqueia escrita em transações de período/fatura travados
-- ---------------------------------------------------------------------------
create or replace function public.enforce_period_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_new public.transactions;
  row_old public.transactions;
begin
  if (tg_op = 'DELETE') then
    row_old := old;
  elsif (tg_op = 'INSERT') then
    row_new := new;
  else
    row_new := new;
    row_old := old;
  end if;

  -- mês fechado (estado novo e/ou antigo)
  if row_new.wallet_id is not null and exists (
    select 1 from public.period_locks pl
     where pl.wallet_id = row_new.wallet_id
       and pl.ref_year  = row_new.ref_year
       and pl.ref_month = row_new.ref_month
  ) then
    raise exception 'Período %/% está fechado nesta carteira. Reabra o mês para editar.',
      row_new.ref_month, row_new.ref_year using errcode = '23514';
  end if;

  if row_old.wallet_id is not null and exists (
    select 1 from public.period_locks pl
     where pl.wallet_id = row_old.wallet_id
       and pl.ref_year  = row_old.ref_year
       and pl.ref_month = row_old.ref_month
  ) then
    raise exception 'Período %/% está fechado nesta carteira. Reabra o mês para editar.',
      row_old.ref_month, row_old.ref_year using errcode = '23514';
  end if;

  -- fatura fechada/paga (só barra compras/receitas; transferências de pagamento passam)
  if row_new.card_invoice_id is not null and coalesce(row_new.kind, '') <> 'transfer' then
    if exists (
      select 1 from public.card_invoices ci
       where ci.id = row_new.card_invoice_id and ci.status <> 'open'
    ) then
      raise exception 'Fatura fechada ou paga. Reabra a fatura para lançar nela.'
        using errcode = '23514';
    end if;
  end if;

  if (tg_op = 'DELETE') then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_transactions_period_lock on public.transactions;
create trigger trg_transactions_period_lock
  before insert or update or delete on public.transactions
  for each row execute function public.enforce_period_lock();

-- ---------------------------------------------------------------------------
-- C) Hora do servidor
-- ---------------------------------------------------------------------------
create or replace function public.app_now()
returns timestamptz language sql stable as $$ select now() $$;

create or replace function public.app_today()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

commit;
