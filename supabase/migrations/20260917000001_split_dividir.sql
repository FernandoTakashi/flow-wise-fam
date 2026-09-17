-- "Dividir" — módulo de despesa em grupo, apartado da carteira.
-- Nenhuma tabela aqui referencia wallets/accounts/transactions.
begin;

-- ---------------------------------------------------------------------------
-- 0. Visitante anônimo não ganha carteira pessoal
-- ---------------------------------------------------------------------------
-- O fluxo de convite do Dividir usa supabase.auth.signInAnonymously() pra
-- deixar alguém sem conta entrar num grupo só com um nome. Isso dispara o
-- MESMO trigger on_auth_user_created — sem este ajuste, todo visitante
-- ganharia de graça uma "Minha Carteira" com categorias/contas padrão, o que
-- não faz sentido nenhum (e polui o banco com carteira órfã se a pessoa nunca
-- mais voltar). O perfil ainda é criado (barato, e dá pra achar um nome caso
-- precise), só a semeadura de carteira é pulada.
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

  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

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

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table public.split_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references public.profiles (id) on delete set null,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Um membro é UMA das três coisas: uma conta de verdade (user_id), alguém
-- identificado só pelo Telegram (telegram_user_id), ou um nome puro sem
-- nenhum dos dois (placeholder manual). Nunca os dois ao mesmo tempo.
create table public.split_members (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.split_groups (id) on delete cascade,
  user_id          uuid references public.profiles (id) on delete set null,
  telegram_user_id bigint,
  display_name     text not null,
  left_at          timestamptz,
  created_at       timestamptz not null default now(),
  constraint split_members_one_identity check (user_id is null or telegram_user_id is null)
);
create unique index split_members_group_user_uniq
  on public.split_members (group_id, user_id) where user_id is not null;
create unique index split_members_group_tg_uniq
  on public.split_members (group_id, telegram_user_id) where telegram_user_id is not null;

-- O convite (link do app ou comando /conectar no Telegram) é a mesma porta
-- pras duas coisas: alguém entra como membro (web) ou um grupo do Telegram
-- se liga a este split_group (bot). O `id` já é o token — imprevisível o
-- bastante (uuid) sem precisar de uma coluna extra.
create table public.split_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.split_groups (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Espelha chat_links, mas liga um GRUPO do Telegram (não uma pessoa) a um
-- split_group.
create table public.split_chat_links (
  id         uuid primary key default gen_random_uuid(),
  provider   text not null default 'telegram',
  external_id text not null,
  group_id   uuid not null references public.split_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table public.split_expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.split_groups (id) on delete cascade,
  description text not null default '',
  amount_cents bigint not null check (amount_cents > 0),
  paid_by     uuid not null references public.split_members (id) on delete restrict,
  date        date not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Sempre valor exato em centavos, resolvido na criação — não importa se a
-- tela usou "igual" ou "valor exato", aqui já chega pronto.
create table public.split_shares (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.split_expenses (id) on delete cascade,
  member_id   uuid not null references public.split_members (id) on delete cascade,
  share_cents bigint not null check (share_cents >= 0),
  unique (expense_id, member_id)
);

-- "Fulano me pagou R$ 50" — acerto, não despesa nova.
create table public.split_payments (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.split_groups (id) on delete cascade,
  from_member  uuid not null references public.split_members (id) on delete restrict,
  to_member    uuid not null references public.split_members (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  date         date not null,
  note         text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint split_payments_distinct_members check (from_member <> to_member)
);

-- Pendência de confirmação do bot POR PESSOA dentro do grupo — várias
-- pessoas podem estar confirmando um lançamento ao mesmo tempo no mesmo
-- grupo (diferente do chat_pending 1:1, que é por chat inteiro).
create table public.split_pending (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.split_groups (id) on delete cascade,
  telegram_user_id  bigint not null,
  kind              text not null,
  payload           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index split_pending_lookup_idx on public.split_pending (group_id, telegram_user_id);

create index split_members_group_idx  on public.split_members (group_id) where left_at is null;
create index split_expenses_group_idx on public.split_expenses (group_id, date);
create index split_shares_member_idx  on public.split_shares (member_id);
create index split_payments_group_idx on public.split_payments (group_id);
create index split_invites_group_idx  on public.split_invites (group_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- 2. RLS — leitura pra quem é membro ativo; escrita de verdade acontece via
-- API própria com service role (mesmo padrão de wallets), isto aqui é a
-- segunda camada de defesa, não a única.
-- ---------------------------------------------------------------------------
create or replace function public.is_split_group_member(g uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.split_members m
    where m.group_id = g and m.user_id = auth.uid() and m.left_at is null
  );
$$;

alter table public.split_groups     enable row level security;
alter table public.split_members    enable row level security;
alter table public.split_invites    enable row level security;
alter table public.split_chat_links enable row level security;
alter table public.split_expenses   enable row level security;
alter table public.split_shares     enable row level security;
alter table public.split_payments   enable row level security;

create policy split_groups_read on public.split_groups
  for select using (public.is_split_group_member(id) or created_by = auth.uid());

create policy split_members_read on public.split_members
  for select using (public.is_split_group_member(group_id));

create policy split_expenses_read on public.split_expenses
  for select using (public.is_split_group_member(group_id));

create policy split_shares_read on public.split_shares
  for select using (
    exists (select 1 from public.split_expenses e
            where e.id = expense_id and public.is_split_group_member(e.group_id))
  );

create policy split_payments_read on public.split_payments
  for select using (public.is_split_group_member(group_id));

-- convites e vínculo de chat não têm leitura direta por RLS — sempre passam
-- pela API (o convite precisa ser legível por gente SEM sessão nenhuma, o
-- que RLS não cobre; a checagem de validade fica no backend).

commit;
