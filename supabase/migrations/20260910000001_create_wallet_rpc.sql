-- Criação de carteira num único RPC atômico.
-- O caminho antigo (insert wallets -> insert wallet_members -> rpc seed_wallet)
-- quebrava com "new row violates row-level security policy for table wallets":
-- o .select() logo após o insert lê a linha sob a policy wallets_read
-- (is_wallet_member(id)), mas a associação de dono só era criada no passo
-- seguinte. Aqui tudo acontece na mesma transacao, como no handle_new_user.
begin;

create or replace function public.create_wallet(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  w   uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.wallets (name, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'Nova carteira'), uid)
  returning id into w;

  insert into public.wallet_members (wallet_id, user_id, role)
  values (w, uid, 'owner');

  perform public.seed_wallet(w);

  return w;
end;
$$;

grant execute on function public.create_wallet(text) to authenticated;

commit;
