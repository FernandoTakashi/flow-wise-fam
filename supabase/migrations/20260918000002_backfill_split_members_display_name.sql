-- Backfill de uma vez só: o gatilho da migração anterior só pega mudanças de
-- nome DAQUI PRA FRENTE. Isso aqui alinha o que já estava desatualizado —
-- qualquer split_members cujo display_name não bate mais com o nome atual
-- do perfil (mudou o nome em Ajustes antes do gatilho existir).
update public.split_members sm
set display_name = p.name
from public.profiles p
where sm.user_id = p.id
  and sm.display_name is distinct from p.name
  and coalesce(p.name, '') <> '';
