-- =============================================================================
-- recurrences.day: permite 0 = "último dia do mês"
-- =============================================================================
-- Meses têm 28-31 dias; cadastrar "dia 31" para contas do fim do mês fica
-- errado em fevereiro/abril/etc. `day = 0` passa a significar "último dia",
-- resolvido dinamicamente por mês no app (recurrenceDueISO).
-- =============================================================================

begin;

alter table public.recurrences drop constraint if exists recurrences_day_check;
alter table public.recurrences
  add constraint recurrences_day_check check (day between 0 and 31);

comment on column public.recurrences.day is '1-31 = dia fixo do mês; 0 = último dia do mês';

commit;
