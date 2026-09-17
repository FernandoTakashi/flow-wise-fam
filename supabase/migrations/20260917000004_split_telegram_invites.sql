-- Convite individual do Telegram gerado a partir do app: quando alguém já
-- entrou num grupo do Dividir pelo site e o grupo tem um chat do Telegram
-- conectado, o app gera um link de convite exclusivo (member_limit=1) e
-- guarda aqui "esse link é dessa pessoa". Quando ela entra no grupo do
-- Telegram, o webhook usa essa tabela pra saber quem é sem precisar
-- perguntar nem criar um membro duplicado — só liga o Telegram dela na
-- conta (chat_links), o split_members já existe desde o join pelo site.
create table public.split_telegram_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.split_groups(id) on delete cascade,
  member_id uuid not null references public.split_members(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invite_link text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index split_telegram_invites_link_idx on public.split_telegram_invites (invite_link);

alter table public.split_telegram_invites enable row level security;
-- só o backend (service role) mexe aqui — nenhuma policy pra anon/authenticated.
