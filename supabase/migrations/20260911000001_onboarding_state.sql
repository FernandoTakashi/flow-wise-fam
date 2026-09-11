-- Estado do onboarding guiado (wizard pós-cadastro + dicas de primeira visita
-- por página). Fica no perfil porque é por PESSOA, não por carteira — cada
-- membro vê seu próprio progresso mesmo numa carteira compartilhada.
begin;

alter table public.profiles
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

comment on column public.profiles.onboarding is
  'Progresso do onboarding guiado: { wizardDone: bool, tips: { <pageKey>: bool } }';

commit;
