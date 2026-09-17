-- O criador de um grupo do Dividir criado pelo app entrava com
-- display_name fixo em 'Você', que aparecia assim pra todo mundo do grupo
-- (não só pra quem criou). Preenche com o nome real do perfil pros grupos
-- já criados; daqui pra frente createSplitGroup() já grava o nome certo.
update public.split_members sm
set display_name = p.name
from public.profiles p
where sm.user_id = p.id
  and sm.display_name = 'Você'
  and coalesce(p.name, '') <> '';
