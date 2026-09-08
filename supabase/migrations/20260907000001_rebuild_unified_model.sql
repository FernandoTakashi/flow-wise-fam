-- =============================================================================
-- FinanceApp — reconstrução do modelo (unified transactions)
-- =============================================================================
-- Substitui o modelo antigo (expenses / cash_movements / fixed_* /
-- credit_card_payments / accounts) por um modelo único centrado em
-- `transactions`, com RLS por carteira e onboarding automático no signup.
--
-- A base de DADOS é zerada (o projeto vai recomeçar os cadastros).
-- Os usuários de auth devem ser apagados no painel (Authentication > Users)
-- para que o trigger de onboarding rode no próximo cadastro.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Limpeza do modelo antigo
-- ---------------------------------------------------------------------------
drop table if exists public.credit_card_payments   cascade;
drop table if exists public.fixed_income_receipts  cascade;
drop table if exists public.fixed_expense_payments cascade;
drop table if exists public.fixed_incomes          cascade;
drop table if exists public.fixed_expenses         cascade;
drop table if exists public.cash_movements         cascade;
drop table if exists public.expenses               cascade;
drop table if exists public.investments            cascade;
drop table if exists public.credit_cards           cascade;
drop table if exists public.financial_settings     cascade;
drop table if exists public.account_members        cascade;
drop table if exists public.accounts               cascade;
drop table if exists public.app_users              cascade;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Identidade
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  email      text,
  created_at timestamptz not null default now()
);

create table public.wallets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  base_currency text not null default 'BRL',
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.wallet_members (
  wallet_id  uuid not null references public.wallets (id)  on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (wallet_id, user_id)
);
create index wallet_members_user_idx on public.wallet_members (user_id);

-- ---------------------------------------------------------------------------
-- 2. Estrutura da carteira
-- ---------------------------------------------------------------------------

-- Fontes de dinheiro: caixa, conta corrente, cartão de crédito
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  wallet_id             uuid not null references public.wallets (id) on delete cascade,
  name                  text not null,
  kind                  text not null check (kind in ('cash', 'checking', 'card')),
  opening_balance_cents bigint not null default 0,
  -- só para kind = 'card'
  closing_day           smallint check (closing_day between 1 and 31),
  due_day               smallint check (due_day between 1 and 31),
  credit_limit_cents    bigint,
  archived              boolean not null default false,
  created_at            timestamptz not null default now()
);
create index accounts_wallet_idx on public.accounts (wallet_id);

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  wallet_id  uuid not null references public.wallets (id) on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('income', 'expense')),
  icon       text,
  color      text,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index categories_wallet_idx on public.categories (wallet_id);

-- Modelos recorrentes (ex-"gastos fixos" / "entradas fixas")
create table public.recurrences (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references public.wallets (id) on delete cascade,
  description  text not null,
  kind         text not null check (kind in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents > 0),
  category_id  uuid references public.categories (id) on delete set null,
  account_id   uuid references public.accounts (id)   on delete set null,
  day          smallint not null check (day between 1 and 31),
  frequency    text not null default 'monthly' check (frequency in ('monthly')),
  start_date   date not null,
  end_date     date,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index recurrences_wallet_idx on public.recurrences (wallet_id);

-- Faturas de cartão: 1 registro por (cartão, mês/ano de referência)
create table public.card_invoices (
  id                  uuid primary key default gen_random_uuid(),
  wallet_id           uuid not null references public.wallets (id)  on delete cascade,
  account_id          uuid not null references public.accounts (id) on delete cascade,
  ref_month           smallint not null check (ref_month between 1 and 12),
  ref_year            smallint not null,
  closing_date        date not null,
  due_date            date not null,
  status              text not null default 'open' check (status in ('open', 'paid')),
  paid_transaction_id uuid,
  created_at          timestamptz not null default now(),
  unique (account_id, ref_year, ref_month)
);

-- ---------------------------------------------------------------------------
-- 3. Movimento
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  wallet_id         uuid not null references public.wallets (id)  on delete cascade,
  account_id        uuid not null references public.accounts (id) on delete restrict,
  kind              text not null check (kind in ('income', 'expense', 'transfer')),
  amount_cents      bigint not null check (amount_cents > 0),
  date              date not null,
  status            text not null default 'cleared' check (status in ('pending', 'cleared')),
  description       text not null default '',
  category_id       uuid references public.categories (id)   on delete set null,
  member_id         uuid references public.profiles (id)     on delete set null, -- quem pagou/recebeu
  card_invoice_id   uuid references public.card_invoices (id) on delete set null,
  recurrence_id     uuid references public.recurrences (id)   on delete set null,
  installment_group uuid,
  installment_no    smallint,
  installment_of    smallint,
  transfer_peer_id  uuid references public.transactions (id)  on delete set null,
  note              text,
  created_by        uuid references public.profiles (id)      on delete set null,
  created_at        timestamptz not null default now()
);
create index transactions_wallet_date_idx  on public.transactions (wallet_id, date);
create index transactions_account_idx      on public.transactions (account_id, status, date);
create index transactions_invoice_idx      on public.transactions (card_invoice_id);
create index transactions_recurrence_idx   on public.transactions (recurrence_id, date);

alter table public.card_invoices
  add constraint card_invoices_paid_tx_fk
  foreign key (paid_transaction_id) references public.transactions (id) on delete set null;

-- Divisão de despesa entre membros (camada estilo Splitwise).
-- Sem linhas => a despesa é 100% de quem pagou (member_id).
-- Com linhas => share_cents diz quanto cada membro deve daquela despesa.
create table public.transaction_splits (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  member_id      uuid not null references public.profiles (id)     on delete cascade,
  share_cents    bigint not null check (share_cents >= 0),
  unique (transaction_id, member_id)
);
create index transaction_splits_tx_idx on public.transaction_splits (transaction_id);

create table public.investments (
  id             uuid primary key default gen_random_uuid(),
  wallet_id      uuid not null references public.wallets (id) on delete cascade,
  member_id      uuid references public.profiles (id) on delete set null,
  description    text not null,
  amount_cents   bigint not null check (amount_cents > 0),
  yield_rate_bps integer not null default 0, -- pontos-base ao mês: 50 = 0,50% a.m.
  date           date not null,
  created_at     timestamptz not null default now()
);
create index investments_wallet_idx on public.investments (wallet_id);

create table public.wallet_settings (
  wallet_id                uuid primary key references public.wallets (id) on delete cascade,
  initial_investment_cents bigint not null default 0,
  default_yield_bps        integer not null default 0,
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
create or replace function public.is_wallet_member(w uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.wallet_members m
    where m.wallet_id = w and m.user_id = auth.uid()
  );
$$;

alter table public.profiles           enable row level security;
alter table public.wallets            enable row level security;
alter table public.wallet_members     enable row level security;
alter table public.accounts           enable row level security;
alter table public.categories         enable row level security;
alter table public.recurrences        enable row level security;
alter table public.card_invoices      enable row level security;
alter table public.transactions       enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.investments        enable row level security;
alter table public.wallet_settings    enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_comembers_read on public.profiles
  for select using (
    exists (
      select 1
      from public.wallet_members me
      join public.wallet_members them on them.wallet_id = me.wallet_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

-- wallets -----------------------------------------------------------------
create policy wallets_read on public.wallets
  for select using (public.is_wallet_member(id));

create policy wallets_insert on public.wallets
  for insert with check (created_by = auth.uid());

create policy wallets_owner_write on public.wallets
  for update using (
    exists (select 1 from public.wallet_members m
            where m.wallet_id = wallets.id and m.user_id = auth.uid() and m.role = 'owner')
  );

create policy wallets_owner_delete on public.wallets
  for delete using (
    exists (select 1 from public.wallet_members m
            where m.wallet_id = wallets.id and m.user_id = auth.uid() and m.role = 'owner')
  );

-- wallet_members --------------------------------------------------------
create policy wallet_members_read on public.wallet_members
  for select using (user_id = auth.uid() or public.is_wallet_member(wallet_id));

create policy wallet_members_insert on public.wallet_members
  for insert with check (
    (user_id = auth.uid()
      and exists (select 1 from public.wallets w
                  where w.id = wallet_id and w.created_by = auth.uid()))
    or exists (select 1 from public.wallet_members m
               where m.wallet_id = wallet_members.wallet_id
                 and m.user_id = auth.uid() and m.role = 'owner')
  );

create policy wallet_members_update on public.wallet_members
  for update using (
    exists (select 1 from public.wallet_members m
            where m.wallet_id = wallet_members.wallet_id
              and m.user_id = auth.uid() and m.role = 'owner')
  );

create policy wallet_members_delete on public.wallet_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.wallet_members m
               where m.wallet_id = wallet_members.wallet_id
                 and m.user_id = auth.uid() and m.role = 'owner')
  );

-- tabelas por carteira (mesmo padrão) --------------------------------
create policy accounts_members on public.accounts
  for all using (public.is_wallet_member(wallet_id)) with check (public.is_wallet_member(wallet_id));

create policy categories_members on public.categories
  for all using (public.is_wallet_member(wallet_id)) with check (public.is_wallet_member(wallet_id));

create policy recurrences_members on public.recurrences
  for all using (public.is_wallet_member(wallet_id)) with check (public.is_wallet_member(wallet_id));

create policy card_invoices_members on public.card_invoices
  for all using (public.is_wallet_member(wallet_id)) with check (public.is_wallet_member(wallet_id));

create policy transactions_members on public.transactions
  for all using (public.is_wallet_member(wallet_id)) with check (public.is_wallet_member(wallet_id));

create policy investments_members on public.investments
  for all using (public.is_wallet_member(wallet_id)) with check (public.is_wallet_member(wallet_id));

create policy wallet_settings_members on public.wallet_settings
  for all using (public.is_wallet_member(wallet_id)) with check (public.is_wallet_member(wallet_id));

create policy transaction_splits_members on public.transaction_splits
  for all using (
    exists (select 1 from public.transactions t
            where t.id = transaction_id and public.is_wallet_member(t.wallet_id))
  ) with check (
    exists (select 1 from public.transactions t
            where t.id = transaction_id and public.is_wallet_member(t.wallet_id))
  );

-- ---------------------------------------------------------------------------
-- 5. Onboarding automático
-- ---------------------------------------------------------------------------
create or replace function public.seed_wallet(w uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallet_settings (wallet_id) values (w)
  on conflict (wallet_id) do nothing;

  insert into public.accounts (wallet_id, name, kind, opening_balance_cents)
  values (w, 'Carteira', 'cash', 0);

  insert into public.categories (wallet_id, name, kind, icon) values
    (w, 'Salário',          'income',  'wallet'),
    (w, 'Outras receitas',  'income',  'plus-circle'),
    (w, 'Moradia',          'expense', 'home'),
    (w, 'Alimentação',      'expense', 'utensils'),
    (w, 'Transporte',       'expense', 'car'),
    (w, 'Saúde',            'expense', 'heart-pulse'),
    (w, 'Educação',         'expense', 'graduation-cap'),
    (w, 'Lazer',            'expense', 'party-popper'),
    (w, 'Compras',          'expense', 'shopping-bag'),
    (w, 'Assinaturas',      'expense', 'repeat'),
    (w, 'Vestuário',        'expense', 'shirt'),
    (w, 'Presentes',        'expense', 'gift'),
    (w, 'Outros',           'expense', 'ellipsis');
end;
$$;

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
  on conflict (id) do nothing;

  insert into public.wallets (name, created_by)
  values ('Minha Carteira', new.id)
  returning id into new_wallet;

  insert into public.wallet_members (wallet_id, user_id, role)
  values (new_wallet, new.id, 'owner');

  perform public.seed_wallet(new_wallet);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
