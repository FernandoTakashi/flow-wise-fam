-- =============================================================================
-- recurrences.shared — o pagamento do fixo é um gasto compartilhado
-- =============================================================================
-- Ex.: aluguel, internet, mercado recorrente. Quando true, ao marcar o
-- pagamento a transação recebe divisão igual entre os membros da carteira
-- (mesma mecânica de transaction_splits usada nos lançamentos avulsos).
-- =============================================================================

begin;

alter table public.recurrences
  add column if not exists shared boolean not null default false;

comment on column public.recurrences.shared is 'true = ao pagar, divide igualmente entre os membros (transaction_splits)';

commit;
