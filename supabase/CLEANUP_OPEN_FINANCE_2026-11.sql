-- =============================================================================
-- Virada pro Open Finance (Pluggy) — corte em 01/11/2026.
-- Outubro fica fechado; a partir de 01/11 os lançamentos de TODAS as contas
-- são apagados, e nas contas ligadas ao banco passam a vir só da Pluggy.
--
-- Antes de rodar:
--   1. APPLY_PENDING.sql com os blocos 20261118000001 e 20261118000002.
--   2. No app (Ajustes › Integrações): conectar os bancos e LIGAR cada conta
--      do banco à conta da carteira. A data de corte só é gravada nas ligadas.
--
-- Rode no SQL Editor do Supabase, UMA PARTE DE CADA VEZ, na ordem.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PARTE 1 — PRÉVIA (só leitura). Manda o resultado pro Claude antes da Parte 3.
-- -----------------------------------------------------------------------------
with w as (select distinct wallet_id from public.bank_connections)
select
  a.name                                  as conta,
  a.kind                                  as tipo,
  (ba.id is not null)                     as ligada_ao_banco,
  t.source                                as origem,
  t.kind                                  as movimento,
  count(*)                                as qtd,
  round(sum(t.amount_cents) / 100.0, 2)   as total_reais,
  min(t.date)                             as de,
  max(t.date)                             as ate,
  count(*) filter (where t.ref_year = 2026 and t.ref_month = 10) as com_competencia_outubro,
  count(*) filter (where t.recurrence_id is not null)            as baixas_de_fixo
from public.transactions t
join w on w.wallet_id = t.wallet_id
join public.accounts a on a.id = t.account_id
left join public.bank_accounts ba on ba.account_id = a.id
where t.date >= '2026-11-01'
group by 1, 2, 3, 4, 5
order by 1, 4, 5;

-- quantas carteiras têm banco conectado (precisa ser 1) e contas ligadas
select
  (select count(distinct wallet_id) from public.bank_connections)                    as carteiras_com_banco,
  (select count(*) from public.bank_accounts where account_id is not null)           as contas_ligadas,
  (select count(*) from public.bank_accounts where account_id is null)               as contas_nao_ligadas;


-- -----------------------------------------------------------------------------
-- PARTE 2 — BACKUP (cria tabelas de cópia; não apaga nada)
-- -----------------------------------------------------------------------------
create table if not exists public.backup_tx_20261118 as
  select t.* from public.transactions t
   where t.wallet_id in (select distinct wallet_id from public.bank_connections)
     and t.date >= '2026-11-01';

create table if not exists public.backup_tx_splits_20261118 as
  select s.* from public.transaction_splits s
   where s.transaction_id in (select id from public.backup_tx_20261118);

create table if not exists public.backup_invoices_20261118 as
  select ci.* from public.card_invoices ci
   where ci.wallet_id in (select distinct wallet_id from public.bank_connections);

-- confere: a contagem tem que bater com a soma de "qtd" da Parte 1
select count(*) as lancamentos_no_backup from public.backup_tx_20261118;

-- backup fora do Supabase (opcional, recomendado): rode e use "Download CSV"
-- select * from public.backup_tx_20261118 order by date;


-- -----------------------------------------------------------------------------
-- PARTE 3 — LIMPEZA + CORTE + FECHAR OUTUBRO (tudo ou nada)
-- -----------------------------------------------------------------------------
begin;

do $$
declare
  v_wallet uuid;
  v_owner  uuid;
  v_n      int;
begin
  select count(distinct wallet_id) into v_n from public.bank_connections;
  if v_n <> 1 then
    raise exception 'Esperava 1 carteira com banco conectado, achei %.', v_n;
  end if;
  select wallet_id, created_by into v_wallet, v_owner from public.bank_connections limit 1;

  if (select count(*) from public.backup_tx_20261118) = 0 then
    raise notice 'Backup vazio — nada a apagar a partir de 01/11.';
  end if;

  -- a partir de 01/11, todas as contas (as não ligadas voltam a ser lançadas à mão)
  -- splits saem em cascata; fatura paga perde só o vínculo com o pagamento (continua paga)
  delete from public.transactions
   where wallet_id = v_wallet
     and date >= '2026-11-01'
     and source <> 'import';

  -- data de corte das contas ligadas ao banco
  update public.bank_accounts
     set import_from = '2026-11-01'
   where wallet_id = v_wallet
     and account_id is not null;

  -- outubro fechado
  insert into public.period_locks (wallet_id, ref_year, ref_month, locked_by)
  values (v_wallet, 2026, 10, v_owner)
  on conflict (wallet_id, ref_year, ref_month) do nothing;
end;
$$;

commit;

-- depois: no app, Ajustes › Integrações › "Importar do banco" e, em cada conta
-- (não cartão), "Igualar ao banco" se aparecer diferença no saldo.


-- -----------------------------------------------------------------------------
-- DESFAZER (só se precisar): devolve o que foi apagado e tira o corte
-- -----------------------------------------------------------------------------
-- begin;
-- delete from public.transactions where source = 'import' and date >= '2026-11-01'
--   and wallet_id in (select distinct wallet_id from public.bank_connections);
-- update public.bank_accounts set import_from = null;
-- insert into public.transactions select * from public.backup_tx_20261118 on conflict (id) do nothing;
-- insert into public.transaction_splits select * from public.backup_tx_splits_20261118 on conflict (id) do nothing;
-- commit;
