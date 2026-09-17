-- Corrige "Database error creating anonymous user": profiles.name é
-- `not null default ''`, mas pra um usuário anônimo `new.email` é NULL, e
-- `split_part(NULL, '@', 1)` também é NULL — o coalesce inteiro virava NULL
-- e o INSERT passava NULL explícito pro name (o default só vale quando a
-- coluna é omitida, não quando NULL é passado à mão). Isso derrubava a
-- criação do usuário anônimo inteira, não só o profile.
begin;

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
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Convidado'
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

commit;
