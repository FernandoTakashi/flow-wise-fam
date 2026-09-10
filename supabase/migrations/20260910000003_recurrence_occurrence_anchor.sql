-- Âncora estável da ocorrência de recorrência: (recurrence_id, occ_month, occ_year).
-- Antes a ocorrência era identificada por `date` (= vencimento). Isso quebrava
-- quando a baixa era dada em outro dia: um salário marcado como recebido ANTES
-- do dia de vencimento ficava com data futura e sumia do saldo e da projeção.
-- Agora `date` guarda o dia real da baixa (regime de caixa) e a ocorrência é
-- ancorada em occ_month/occ_year, que não mudam.
begin;

alter table public.transactions
  add column if not exists occ_month smallint,
  add column if not exists occ_year  smallint;

-- backfill: transações de recorrência existentes têm date = vencimento da
-- ocorrência, então mês/ano da ocorrência = mês/ano de date.
update public.transactions
   set occ_month = extract(month from date)::smallint,
       occ_year  = extract(year  from date)::smallint
 where recurrence_id is not null and occ_month is null;

-- de-dup por ocorrência (caso raro: 2 lançamentos do mesmo fixo no mesmo mês
-- em dias diferentes). Mantém 'cleared' e o mais antigo.
with ranked as (
  select id,
         row_number() over (
           partition by recurrence_id, occ_year, occ_month
           order by (status = 'cleared') desc, created_at asc
         ) as rn
  from public.transactions
  where recurrence_id is not null
)
delete from public.transactions t using ranked r
where t.id = r.id and r.rn > 1;

-- troca o índice único de (recurrence_id, date) para a âncora
drop index if exists transactions_recurrence_occurrence_uniq;
create unique index transactions_recurrence_occurrence_uniq
  on public.transactions (recurrence_id, occ_year, occ_month)
  where recurrence_id is not null;

commit;
