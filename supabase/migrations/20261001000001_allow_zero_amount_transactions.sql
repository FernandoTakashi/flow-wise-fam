-- Permite transações de R$0,00. Hoje a única forma de "resolver" um fixo não
-- lançado é marcar com valor > 0 — se você já sabe que não vai pagar/receber
-- isso esse mês, não tinha como zerar e a ocorrência ficava pendente pra
-- sempre, puxando o saldo projetado pra baixo em todos os meses seguintes
-- (a projeção é cumulativa: o que erra num mês carrega pros próximos). A
-- validação de "> 0 pra lançamento normal" continua só na aplicação
-- (api/v1/crud.ts) — aqui o banco passa a aceitar >= 0 de forma geral.
alter table public.transactions drop constraint if exists transactions_amount_cents_check;
alter table public.transactions add constraint transactions_amount_cents_check check (amount_cents >= 0);
