-- Open Finance (Pluggy) — credenciais por pessoa. No plano pessoal (Meu
-- Pluggy) cada titular tem a própria aplicação no Dashboard da Pluggy, com
-- client id/secret próprios. Cada membro da carteira cadastra os seus e
-- conecta os próprios bancos; a conexão guarda de quem é a credencial.
--
-- O secret fica cifrado (AES-256-GCM) com PLUGGY_CREDENTIALS_KEY, que só o
-- backend tem. Sem policy nenhuma: o cliente não lê nem escreve esta tabela.

create table public.pluggy_credentials (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.profiles (id) on delete cascade,
  client_id         text not null,
  secret_ciphertext text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.pluggy_credentials enable row level security;

-- null = credencial do servidor (PLUGGY_CLIENT_ID/SECRET, do dono que configurou o app)
alter table public.bank_connections
  add column if not exists credential_id uuid references public.pluggy_credentials (id) on delete set null;
