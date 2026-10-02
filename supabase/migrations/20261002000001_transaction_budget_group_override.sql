-- Orçamento 50/30/20: uma categoria define o grupo padrão (necessidade/desejo),
-- mas na prática o mesmo gasto pode ser um ou outro dependendo da ocasião
-- (ex.: Uber pro trabalho = necessidade; Uber pra balada = desejo). Em vez de
-- obrigar a criar categorias separadas, cada LANÇAMENTO pode sobrescrever o
-- grupo só pra ele — null (padrão) usa o grupo da categoria.
alter table public.transactions
  add column if not exists budget_group text check (budget_group in ('necessidade', 'desejo'));
comment on column public.transactions.budget_group is
  'Orçamento 50/30/20: sobrescreve o grupo da categoria só pra este lançamento. null = usa o padrão da categoria.';
