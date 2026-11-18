-- Open Finance — regra aprendida pra ligar lançamento do banco ao fixo.
-- Gravada na primeira baixa manual (descrição normalizada do lançamento que
-- o usuário ligou); depois a importação liga sozinha os meses seguintes.
alter table public.recurrences
  add column if not exists match_text text;
