-- split_members.display_name é uma FOTO do nome tirada na hora que a pessoa
-- entrou no grupo (pelo site ou pelo Telegram) — diferente da lista de
-- membros da carteira, que faz join direto com profiles e por isso já
-- reflete mudança de nome sozinha. Sem esse gatilho, mudar o nome em
-- Ajustes nunca alcançava os grupos em que a pessoa já estava.
create or replace function public.sync_profile_name_to_split_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.split_members
    set display_name = new.name
    where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_name_change on public.profiles;
create trigger on_profile_name_change
  after update of name on public.profiles
  for each row
  execute function public.sync_profile_name_to_split_members();
