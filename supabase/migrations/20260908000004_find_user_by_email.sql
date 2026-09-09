-- =============================================================================
-- Convidar membro por e-mail: RPC que resolve e-mail -> user_id ignorando RLS
-- =============================================================================
-- A policy `profiles_comembers_read` esconde o perfil de quem ainda não é
-- co-membro, então o dono não conseguia achar a pessoa pra convidar. Esta
-- função security-definer devolve só o id (nada mais) de um e-mail conhecido.
-- Também faz backfill de profiles.email a partir de auth.users.
-- =============================================================================

begin;

-- backfill de e-mails faltando nos perfis
update public.profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and (p.email is null or p.email = '')
   and u.email is not null;

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles
  where lower(email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public, anon;
grant execute on function public.find_user_id_by_email(text) to authenticated;

commit;
