-- Orçamento 50/30/20: cada categoria de despesa ganha um grupo
-- (necessidade/desejo) e, opcionalmente, um valor mensal destinado.
-- Categoria com recorrência fixa ativa vira "necessidade" automaticamente
-- no cálculo do front (src/core/budget.ts) — a coluna abaixo só importa
-- pras categorias sem recorrência, que precisam de uma classificação manual.
alter table public.categories
  add column budget_group text check (budget_group in ('necessidade', 'desejo'));

create table public.category_budgets (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references public.wallets (id) on delete cascade,
  category_id  uuid not null references public.categories (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (wallet_id, category_id)
);

create index category_budgets_wallet_idx on public.category_budgets (wallet_id);

alter table public.category_budgets enable row level security;

create policy category_budgets_members on public.category_budgets
  for all using (public.is_wallet_member(wallet_id)) with check (public.is_wallet_member(wallet_id));
