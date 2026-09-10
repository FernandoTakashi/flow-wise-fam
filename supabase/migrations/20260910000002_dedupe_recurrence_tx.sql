-- Corrige gasto fixo contado duas vezes: ao desfazer e refazer a baixa de uma
-- ocorrência, uma corrida no cliente conseguia inserir uma segunda transação
-- para a mesma ocorrência. Aqui: limpa as duplicatas existentes e impede novas
-- no banco (fonte da verdade), independente do cliente.
begin;

-- 1. Remove duplicatas por ocorrência (mesmo recurrence_id + mesmo vencimento).
--    Mantém a "melhor": prioriza status 'cleared', depois a mais antiga.
with ranked as (
  select id,
         row_number() over (
           partition by recurrence_id, date
           order by (status = 'cleared') desc, created_at asc
         ) as rn
  from public.transactions
  where recurrence_id is not null
)
delete from public.transactions t
using ranked r
where t.id = r.id and r.rn > 1;

-- 2. Uma única transação por ocorrência de recorrência.
--    `date` é sempre o vencimento derivado (ano+mês+dia da recorrência),
--    então (recurrence_id, date) identifica a ocorrência daquele mês.
create unique index if not exists transactions_recurrence_occurrence_uniq
  on public.transactions (recurrence_id, date)
  where recurrence_id is not null;

commit;
