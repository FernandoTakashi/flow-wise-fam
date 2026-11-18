-- Open Finance (Pluggy / Meu Pluggy) — Fase 1: só leitura.
-- Uma conexão = um "item" da Pluggy (um banco autorizado). Cada item traz
-- várias contas do banco (corrente, cartões), que o dono pode ligar a uma
-- conta da carteira pra conferir o saldo. Nada aqui cria lançamento ainda.
--
-- Escrita só pelo backend (service_role, /api/v1/bank): o cliente só lê,
-- então não há policy de insert/update/delete.

create table public.bank_connections (
  id                 uuid primary key default gen_random_uuid(),
  wallet_id          uuid not null references public.wallets (id) on delete cascade,
  provider           text not null default 'pluggy' check (provider in ('pluggy')),
  external_item_id   text not null,
  status             text,
  execution_status   text,
  consent_expires_at timestamptz,
  last_synced_at     timestamptz,
  error_code         text,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider, external_item_id)
);
create index bank_connections_wallet_idx on public.bank_connections (wallet_id);

create table public.bank_accounts (
  id                  uuid primary key default gen_random_uuid(),
  wallet_id           uuid not null references public.wallets (id) on delete cascade,
  connection_id       uuid not null references public.bank_connections (id) on delete cascade,
  external_account_id text not null unique,
  name                text not null,
  type                text not null check (type in ('BANK', 'CREDIT')),
  subtype             text,
  number              text,
  -- conta: saldo; cartão: limite usado (inclui parcelas futuras)
  balance_cents       bigint,
  credit_limit_cents  bigint,
  available_cents     bigint,
  due_date            date,
  -- conta da carteira ligada a esta conta do banco (null = ainda não ligada)
  account_id          uuid unique references public.accounts (id) on delete set null,
  refreshed_at        timestamptz,
  created_at          timestamptz not null default now()
);
create index bank_accounts_wallet_idx on public.bank_accounts (wallet_id);

alter table public.bank_connections enable row level security;
alter table public.bank_accounts enable row level security;

create policy bank_connections_read on public.bank_connections
  for select using (public.is_wallet_member(wallet_id));
create policy bank_accounts_read on public.bank_accounts
  for select using (public.is_wallet_member(wallet_id));
