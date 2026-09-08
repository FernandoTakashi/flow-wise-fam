-- =============================================================================
-- recurrences.variable_amount — o fixo tem valor que muda mês a mês (luz, água…)
-- =============================================================================
-- Só fixos marcados como "valor variável" pedem "informar valor do mês" e
-- valor editável na baixa. Os demais usam sempre o valor cadastrado.
-- =============================================================================

begin;

alter table public.recurrences
  add column if not exists variable_amount boolean not null default false;

comment on column public.recurrences.variable_amount is 'true = valor muda mês a mês; pede confirmação do valor na baixa';
comment on column public.recurrences.autopay is 'informativo: fixo em débito automático; o pagamento ainda é marcado manualmente';

commit;
