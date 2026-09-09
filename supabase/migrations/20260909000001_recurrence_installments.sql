-- =============================================================================
-- recurrences: parcelamento / empréstimo
-- =============================================================================
-- Um empréstimo (ou compra parcelada fora do cartão) é um gasto fixo com um
-- número finito de parcelas. `installments_total` = total de parcelas;
-- `installments_done` = quantas já foram pagas antes de cadastrar no app.
-- A ocorrência do mês deixa de ser gerada depois da última parcela.
-- null / 0 = recorrência normal, sem fim.
-- =============================================================================

begin;

alter table public.recurrences
  add column if not exists installments_total smallint,
  add column if not exists installments_done  smallint not null default 0;

alter table public.recurrences drop constraint if exists recurrences_installments_chk;
alter table public.recurrences
  add constraint recurrences_installments_chk
  check (
    (installments_total is null)
    or (installments_total >= 1 and installments_done >= 0 and installments_done < installments_total)
  );

comment on column public.recurrences.installments_total is 'total de parcelas do empréstimo/parcelamento; null = recorrência sem fim';
comment on column public.recurrences.installments_done  is 'parcelas já pagas antes do cadastro (empréstimo em andamento)';

commit;
