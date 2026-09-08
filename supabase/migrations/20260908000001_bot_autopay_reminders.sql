-- =============================================================================
-- FinanceApp — Fase 3: bot de mensagens, débito automático e lembretes
-- =============================================================================
-- A) transactions.source  — origem do lançamento
--    ('app' | 'telegram' | 'whatsapp' | 'import' | 'auto'). Mantém o modelo
--    unificado import-friendly (bot / sync bancário no futuro).
-- B) recurrences.autopay  — débito automático: o cron cria o lançamento sozinho
--    na data de vencimento (conta = pago; cartão = linha na fatura).
-- C) chat_links / chat_link_tokens — vínculo de um chat (Telegram) a um usuário
--    + carteira. Onboarding por token de uso único gerado no app.
-- D) chat_pending — passo de confirmação (parse -> [Confirmar]) entre mensagens.
-- E) notification_log — idempotência dos lembretes / autopay do cron.
--
-- Sem quebra de dados: só adiciona colunas (com default) e tabelas novas.
-- =============================================================================

begin;

-- A) origem do lançamento ---------------------------------------------------
alter table public.transactions
  add column if not exists source text not null default 'app';

alter table public.transactions
  drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source in ('app', 'telegram', 'whatsapp', 'import', 'auto'));

-- B) débito automático ----------------------------------------------------
alter table public.recurrences
  add column if not exists autopay boolean not null default false;

-- C) vínculo de chat ----------------------------------------------------
create table if not exists public.chat_links (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null default 'telegram' check (provider in ('telegram', 'whatsapp')),
  external_id text not null,                 -- chat id do provedor
  user_id     uuid not null references public.profiles (id) on delete cascade,
  wallet_id   uuid not null references public.wallets (id)  on delete cascade,
  created_at  timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists chat_links_wallet_idx on public.chat_links (wallet_id);
create index if not exists chat_links_user_idx   on public.chat_links (user_id);

create table if not exists public.chat_link_tokens (
  token       text primary key,
  provider    text not null default 'telegram',
  user_id     uuid not null references public.profiles (id) on delete cascade,
  wallet_id   uuid not null references public.wallets (id)  on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- D) passo de confirmação do bot --------------------------------------
create table if not exists public.chat_pending (
  id            uuid primary key default gen_random_uuid(),
  chat_link_id  uuid not null references public.chat_links (id) on delete cascade,
  kind          text not null,      -- 'new_tx' | 'adjust_recurrence'
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists chat_pending_link_idx on public.chat_pending (chat_link_id);

-- E) log de notificações do cron ------------------------------------
create table if not exists public.notification_log (
  id             uuid primary key default gen_random_uuid(),
  wallet_id      uuid not null references public.wallets (id) on delete cascade,
  recurrence_id  uuid not null references public.recurrences (id) on delete cascade,
  kind           text not null,      -- 'due' | 'autopay'
  ref_month      smallint not null,
  ref_year       smallint not null,
  sent_on        date not null default (now() at time zone 'America/Sao_Paulo')::date,
  sent_at        timestamptz not null default now(),
  unique (recurrence_id, kind, ref_month, ref_year, sent_on)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.chat_links        enable row level security;
alter table public.chat_link_tokens  enable row level security;
alter table public.chat_pending      enable row level security;
alter table public.notification_log  enable row level security;

-- chat_links: o dono do vínculo (usuário) enxerga e gerencia os seus.
drop policy if exists chat_links_self on public.chat_links;
create policy chat_links_self on public.chat_links
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_wallet_member(wallet_id));

-- co-membros da carteira podem ver que existe um vínculo (sem escrever).
drop policy if exists chat_links_wallet_read on public.chat_links;
create policy chat_links_wallet_read on public.chat_links
  for select using (public.is_wallet_member(wallet_id));

-- chat_link_tokens: o usuário cria e apaga os seus próprios tokens.
drop policy if exists chat_link_tokens_self on public.chat_link_tokens;
create policy chat_link_tokens_self on public.chat_link_tokens
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_wallet_member(wallet_id));

-- chat_pending / notification_log: sem policy => acessível só pelo service_role
-- (as funções do bot e do cron). O app nunca lê nem escreve nessas tabelas.

commit;
