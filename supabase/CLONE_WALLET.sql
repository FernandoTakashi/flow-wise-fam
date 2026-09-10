-- =============================================================================
-- Utilitário de TESTE: clona todos os dados de uma carteira para outra.
-- Rode este arquivo UMA vez no SQL Editor para criar a função. Depois:
--
--   select id, name from public.wallets order by name;   -- pega os UUIDs
--   select public.clone_wallet('<uuid ORIGEM>', '<uuid DESTINO>');
--
-- A função ZERA a carteira de destino e recopia tudo (contas, categorias,
-- recorrências, faturas, lançamentos, divisões, investimentos, travas de mês,
-- ajustes). NÃO copia membros nem o vínculo do Telegram.
-- Só o dono das DUAS carteiras pode rodar.
-- Para remover depois:  drop function public.clone_wallet(uuid, uuid);
-- =============================================================================
begin;

create or replace function public.clone_wallet(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  res jsonb;
begin
  if p_source = p_target then raise exception 'origem e destino são a mesma carteira'; end if;
  if not exists (select 1 from wallets where id = p_source) then raise exception 'carteira de origem não existe'; end if;
  if not exists (select 1 from wallets where id = p_target) then raise exception 'carteira de destino não existe'; end if;

  -- Chamado por um usuário logado (app): exige ser dono das duas carteiras.
  -- Chamado no SQL Editor (auth.uid() nulo / superusuário): segue sem a checagem.
  if uid is not null and (
       not exists (select 1 from wallet_members where wallet_id = p_source and user_id = uid and role = 'owner')
    or not exists (select 1 from wallet_members where wallet_id = p_target and user_id = uid and role = 'owner')
  ) then
    raise exception 'você precisa ser dono da carteira de origem E da de destino';
  end if;

  -- cópia em massa: não roda os checks de limite/saldo (a ordem das linhas
  -- num INSERT..SELECT não é cronológica e derrubaria o clone)
  perform set_config('carewallet.skip_checks', 'on', true);

  ---------------------------------------------------------------------------
  -- 0. Zera a carteira de destino.
  --    period_locks primeiro: a trigger enforce_period_lock bloqueia
  --    apagar transações em mês fechado.
  ---------------------------------------------------------------------------
  delete from period_locks where wallet_id = p_target;
  delete from transactions where wallet_id = p_target;   -- splits caem por cascade
  delete from card_invoices where wallet_id = p_target;
  delete from investments  where wallet_id = p_target;
  delete from recurrences  where wallet_id = p_target;
  delete from categories   where wallet_id = p_target;
  delete from accounts     where wallet_id = p_target;

  ---------------------------------------------------------------------------
  -- Mapas de id antigo -> novo (temporários, somem no fim da transação)
  ---------------------------------------------------------------------------
  create temp table _m_acc (old uuid primary key, new uuid not null default gen_random_uuid()) on commit drop;
  create temp table _m_cat (old uuid primary key, new uuid not null default gen_random_uuid()) on commit drop;
  create temp table _m_rec (old uuid primary key, new uuid not null default gen_random_uuid()) on commit drop;
  create temp table _m_inv (old uuid primary key, new uuid not null default gen_random_uuid()) on commit drop;
  create temp table _m_tx  (old uuid primary key, new uuid not null default gen_random_uuid()) on commit drop;
  create temp table _m_grp (old uuid primary key, new uuid not null default gen_random_uuid()) on commit drop;

  insert into _m_acc(old) select id from accounts      where wallet_id = p_source;
  insert into _m_cat(old) select id from categories    where wallet_id = p_source;
  insert into _m_rec(old) select id from recurrences   where wallet_id = p_source;
  insert into _m_inv(old) select id from card_invoices where wallet_id = p_source;
  insert into _m_tx(old)  select id from transactions  where wallet_id = p_source;
  insert into _m_grp(old) select distinct installment_group from transactions
    where wallet_id = p_source and installment_group is not null;

  ---------------------------------------------------------------------------
  -- 1. accounts
  ---------------------------------------------------------------------------
  insert into accounts (id, wallet_id, name, kind, opening_balance_cents,
                        closing_day, due_day, credit_limit_cents, archived, created_at)
  select m.new, p_target, a.name, a.kind, a.opening_balance_cents,
         a.closing_day, a.due_day, a.credit_limit_cents, a.archived, a.created_at
  from accounts a join _m_acc m on m.old = a.id
  where a.wallet_id = p_source;

  ---------------------------------------------------------------------------
  -- 2. categories
  ---------------------------------------------------------------------------
  insert into categories (id, wallet_id, name, kind, icon, color, archived, created_at)
  select m.new, p_target, c.name, c.kind, c.icon, c.color, c.archived, c.created_at
  from categories c join _m_cat m on m.old = c.id
  where c.wallet_id = p_source;

  ---------------------------------------------------------------------------
  -- 3. recurrences
  ---------------------------------------------------------------------------
  insert into recurrences (id, wallet_id, description, kind, amount_cents, category_id, account_id,
                           day, frequency, start_date, end_date, active, created_at,
                           autopay, variable_amount, shared, installments_total, installments_done)
  select m.new, p_target, r.description, r.kind, r.amount_cents,
         (select new from _m_cat where old = r.category_id),
         (select new from _m_acc where old = r.account_id),
         r.day, r.frequency, r.start_date, r.end_date, r.active, r.created_at,
         r.autopay, r.variable_amount, r.shared, r.installments_total, r.installments_done
  from recurrences r join _m_rec m on m.old = r.id
  where r.wallet_id = p_source;

  ---------------------------------------------------------------------------
  -- 4. card_invoices — entram como 'open' e sem paid_transaction_id;
  --    status/pagamento reais são ajustados no passo 8 (a trigger bloqueia
  --    inserir transação numa fatura que não está 'open').
  ---------------------------------------------------------------------------
  insert into card_invoices (id, wallet_id, account_id, ref_month, ref_year,
                             closing_date, due_date, status, paid_transaction_id, created_at)
  select m.new, p_target, (select new from _m_acc where old = ci.account_id),
         ci.ref_month, ci.ref_year, ci.closing_date, ci.due_date, 'open', null, ci.created_at
  from card_invoices ci join _m_inv m on m.old = ci.id
  where ci.wallet_id = p_source;

  ---------------------------------------------------------------------------
  -- 5. transactions — transfer_peer_id fica null aqui (passo 7).
  ---------------------------------------------------------------------------
  insert into transactions (id, wallet_id, account_id, kind, amount_cents, date, status, description,
                            category_id, member_id, card_invoice_id, recurrence_id,
                            installment_group, installment_no, installment_of, transfer_peer_id,
                            note, created_by, created_at, ref_month, ref_year, source)
  select m.new, p_target, (select new from _m_acc where old = t.account_id),
         t.kind, t.amount_cents, t.date, t.status, t.description,
         (select new from _m_cat where old = t.category_id),
         t.member_id,
         (select new from _m_inv where old = t.card_invoice_id),
         (select new from _m_rec where old = t.recurrence_id),
         (select new from _m_grp where old = t.installment_group),
         t.installment_no, t.installment_of, null,
         t.note, t.created_by, t.created_at, t.ref_month, t.ref_year, t.source
  from transactions t join _m_tx m on m.old = t.id
  where t.wallet_id = p_source;

  ---------------------------------------------------------------------------
  -- 6. transaction_splits
  ---------------------------------------------------------------------------
  insert into transaction_splits (transaction_id, member_id, share_cents)
  select (select new from _m_tx where old = s.transaction_id), s.member_id, s.share_cents
  from transaction_splits s
  where s.transaction_id in (select old from _m_tx);

  ---------------------------------------------------------------------------
  -- 7. religa transfer_peer_id (pagamento de fatura <-> transferência)
  ---------------------------------------------------------------------------
  update transactions dst
     set transfer_peer_id = (select new from _m_tx where old = src.transfer_peer_id)
  from transactions src
  where src.id = (select old from _m_tx where new = dst.id)
    and dst.wallet_id = p_target
    and src.transfer_peer_id is not null;

  ---------------------------------------------------------------------------
  -- 8. religa faturas: paga -> paid_transaction_id, depois o status real
  ---------------------------------------------------------------------------
  update card_invoices dst
     set paid_transaction_id = (select new from _m_tx where old = src.paid_transaction_id)
  from card_invoices src
  where src.id = (select old from _m_inv where new = dst.id)
    and dst.wallet_id = p_target
    and src.paid_transaction_id is not null;

  update card_invoices dst
     set status = src.status
  from card_invoices src
  where src.id = (select old from _m_inv where new = dst.id)
    and dst.wallet_id = p_target
    and src.status <> 'open';

  ---------------------------------------------------------------------------
  -- 9. investments
  ---------------------------------------------------------------------------
  insert into investments (wallet_id, member_id, description, amount_cents, yield_rate_bps, date, created_at)
  select p_target, i.member_id, i.description, i.amount_cents, i.yield_rate_bps, i.date, i.created_at
  from investments i where i.wallet_id = p_source;

  ---------------------------------------------------------------------------
  -- 10. period_locks — por último, senão bloqueiam os inserts acima
  ---------------------------------------------------------------------------
  insert into period_locks (wallet_id, ref_year, ref_month, locked_by, locked_at)
  select p_target, ref_year, ref_month, locked_by, locked_at
  from period_locks where wallet_id = p_source;

  ---------------------------------------------------------------------------
  -- 11. wallet_settings
  ---------------------------------------------------------------------------
  insert into wallet_settings (wallet_id, initial_investment_cents, default_yield_bps, updated_at)
  select p_target, initial_investment_cents, default_yield_bps, now()
  from wallet_settings where wallet_id = p_source
  on conflict (wallet_id) do update
    set initial_investment_cents = excluded.initial_investment_cents,
        default_yield_bps        = excluded.default_yield_bps,
        updated_at               = now();

  res := jsonb_build_object(
    'accounts',     (select count(*) from accounts     where wallet_id = p_target),
    'categories',   (select count(*) from categories   where wallet_id = p_target),
    'recurrences',  (select count(*) from recurrences  where wallet_id = p_target),
    'card_invoices',(select count(*) from card_invoices where wallet_id = p_target),
    'transactions', (select count(*) from transactions where wallet_id = p_target),
    'investments',  (select count(*) from investments  where wallet_id = p_target),
    'period_locks', (select count(*) from period_locks where wallet_id = p_target)
  );
  return res;
end;
$$;

revoke all on function public.clone_wallet(uuid, uuid) from public, anon;
grant execute on function public.clone_wallet(uuid, uuid) to authenticated;

commit;
