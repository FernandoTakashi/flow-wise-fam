-- =============================================================================
-- Migrações pendentes 20260908000002..000006 consolidadas.
-- Rode UMA vez no SQL Editor do Supabase. Seguro re-rodar.
-- =============================================================================
begin;

-- 000002 — recurrences.day = 0 significa "último dia do mês"
alter table public.recurrences drop constraint if exists recurrences_day_check;
alter table public.recurrences
  add constraint recurrences_day_check check (day between 0 and 31);
comment on column public.recurrences.day is '1-31 = dia fixo do mês; 0 = último dia do mês';

-- 000003 — recurrences.variable_amount (valor muda mês a mês)
alter table public.recurrences
  add column if not exists variable_amount boolean not null default false;
comment on column public.recurrences.variable_amount is 'true = valor muda mês a mês; pede confirmação do valor na baixa';
comment on column public.recurrences.autopay is 'informativo: fixo em débito automático; o pagamento ainda é marcado manualmente';

-- 000006 — recurrences.shared (pagamento é gasto compartilhado)
alter table public.recurrences
  add column if not exists shared boolean not null default false;
comment on column public.recurrences.shared is 'true = ao pagar, divide igualmente entre os membros (transaction_splits)';

-- 000004 — backfill de profiles.email a partir de auth.users
update public.profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and (p.email is null or p.email = '')
   and u.email is not null;

-- 000005 — RPC de convite por e-mail (versão robusta)
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
