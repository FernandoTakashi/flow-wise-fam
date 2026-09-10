-- "Gasto compartilhado" vira um MARCADOR simples ("foi um gasto dos dois
-- juntos"), usado só no resumo (quanto A gastou / quanto B gastou / quanto foi
-- em conjunto). Deixa de gerar transaction_splits automaticamente — a divisão
-- de contas (acerto) fica como feature separada e futura.
begin;

alter table public.transactions
  add column if not exists shared boolean not null default false;

comment on column public.transactions.shared is
  'true = gasto feito pelos membros em conjunto; no resumo conta em "em conjunto", não no total individual de ninguém';

-- backfill: o que hoje tem divisão vira "em conjunto"
update public.transactions
   set shared = true
 where shared = false
   and id in (select distinct transaction_id from public.transaction_splits);

-- as divisões automáticas (partes iguais) não carregam informação real —
-- limpa. A tabela fica para uma futura feature de acerto com partes de verdade.
delete from public.transaction_splits;

commit;
