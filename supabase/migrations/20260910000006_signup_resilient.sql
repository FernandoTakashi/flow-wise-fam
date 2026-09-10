-- Onboarding no cadastro não pode derrubar o signup. Se a criação da carteira
-- semente falhar, o usuário ainda é criado; o app cria a carteira no primeiro
-- load (auto-heal via create_wallet).
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
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  on conflict (id) do update set email = coalesce(excluded.email, public.profiles.email);

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
