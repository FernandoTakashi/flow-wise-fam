-- =============================================================================
-- find_user_id_by_email — versão robusta
-- =============================================================================
-- Se o e-mail não estiver em `profiles` (perfil nunca criado, ou email null),
-- procura direto em `auth.users` e, achando, cria/corrige a linha de profiles.
-- Assim o convite por e-mail funciona pra qualquer conta que exista no auth.
-- =============================================================================

begin;

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_name text;
  v_mail text := lower(trim(p_email));
begin
  select id into v_id from public.profiles where lower(email) = v_mail limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select u.id,
         coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name',
           split_part(u.email, '@', 1)
         )
    into v_id, v_name
    from auth.users u
   where lower(u.email) = v_mail
   limit 1;

  if v_id is not null then
    insert into public.profiles (id, name, email)
    values (v_id, coalesce(v_name, ''), v_mail)
    on conflict (id) do update set email = excluded.email;
  end if;

  return v_id;
end;
$$;

revoke all on function public.find_user_id_by_email(text) from public, anon;
grant execute on function public.find_user_id_by_email(text) to authenticated;

commit;
