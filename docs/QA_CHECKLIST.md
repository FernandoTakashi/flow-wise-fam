# Checklist de QA

Roteiro manual pra rodar no ambiente de staging antes de promover pra
produção (merge em `main`). Não substitui os testes automatizados
(`npm run test`) — cobre o que eles não cobrem: fluxo real, UI, bot.

Marque com a data/quem testou ao rodar. Se algo quebrar, vira issue —
não corrige "de passagem" sem anotar o que era.

## Autenticação

- [ ] Cadastro com e-mail novo → recebe e-mail de confirmação com a cara do app
- [ ] Confirma o e-mail → entra logado, wizard de onboarding aparece
- [ ] Login com e-mail/senha errados → mensagem amigável, não trava
- [ ] "Esqueci minha senha" → tela própria, recebe e-mail, define senha nova, consegue logar com ela
- [ ] "Continuar com Google" → completa o fluxo e cai logado
- [ ] "Sair" funciona em: Ajustes → Perfil (mobile e desktop), menu "Mais" (mobile), sidebar (desktop)

## Onboarding guiado

- [ ] Wizard completo: nomear carteira → confirmar conta → convidar parceiro (pular) → conectar bot (pular) → concluir
- [ ] Dicas de primeira visita aparecem em Dashboard, Lançamentos, Fixos, Cartões — e não voltam depois de dispensadas
- [ ] Convidar parceiro de verdade (e-mail de uma conta já cadastrada) → aparece em Membros

## Lançamentos

- [ ] Criar despesa em conta de dinheiro — desconta o saldo
- [ ] Criar despesa no cartão — entra na fatura do mês certo
- [ ] Criar receita — soma no saldo
- [ ] Editar um lançamento existente (valor, conta, categoria, data)
- [ ] Excluir um lançamento
- [ ] Descrição aparece como primeiro campo do formulário e primeira coluna da lista
- [ ] Tentar lançar acima do saldo/limite → banco recusa com mensagem amigável
- [ ] Marcar "gasto em conjunto" → aparece certo no resumo por membro
- [ ] Botão "Lançar" da tab bar mobile abre o formulário toda vez, mesmo repetindo

## Fixos (recorrências)

- [ ] Criar fixo de saída e de entrada
- [ ] Dar baixa (marcar pago/recebido) — gera o lançamento certo
- [ ] Desmarcar uma baixa e marcar de novo — não duplica
- [ ] Fixo de valor variável — informar valor sem pagar, depois confirmar
- [ ] Fixo parcelado — número da parcela e "faltam X" corretos
- [ ] Chips (conta, categoria, valor variável, débito automático) não quebram feio no mobile

## Cartões

- [ ] Criar cartão novo (limite, fechamento, vencimento)
- [ ] Pagar fatura — gera a transferência e marca como paga
- [ ] Estornar pagamento de fatura — volta a ficar em aberto
- [ ] Fechar/reabrir fatura manualmente

## Investimentos

- [ ] Criar aplicação, editar, excluir
- [ ] Rendimento estimado aparece certo no resumo

## Fechamento de mês

- [ ] Fechar um mês (só dono consegue)
- [ ] Botões de lançamento/receita somem/desabilitam no mês fechado
- [ ] Tentar lançar em mês fechado via API direta → trigger recusa
- [ ] Reabrir o mês — volta a liberar

## Membros e carteiras

- [ ] Convidar membro por e-mail (conta existente e inexistente — mensagens diferentes)
- [ ] Remover membro
- [ ] Criar segunda carteira, trocar entre elas
- [ ] Renomear/excluir carteira (só dono; app recusa excluir a última)

## Bot do Telegram

- [ ] Gerar link de conexão em Ajustes → Integrações, conectar
- [ ] Lançar por mensagem ("mercado 42,90 nubank")
- [ ] Perguntar saldo/quanto falta pagar — resposta bate com o app
- [ ] Dizer "paguei o aluguel" → marca o fixo certo
- [ ] Dizer "paguei a fatura do [cartão]" → confirma e quita a fatura certa
- [ ] Dizer "cadastra [descrição] [valor] todo dia [N]" → confirma e cria o fixo
- [ ] Dizer "desfaz" (ou `/desfazer`) logo após lançar algo → apaga o lançamento certo
- [ ] Mandar foto de um comprovante (PIX/cartão/boleto) → lê valor/estabelecimento/data e confirma
- [ ] Mandar foto de algo que não é comprovante → avisa que não conseguiu ler, não quebra
- [ ] Comprovante sem conta identificável → aparece "✏️ Completar conta/categoria"; tocar mostra botões com as contas de verdade da carteira
- [ ] Escolher a conta por botão → se a categoria também estiver faltando, aparecem botões de categoria em seguida
- [ ] No passo de completar, responder por texto (em vez de tocar no botão) com o nome da conta/categoria também funciona
- [ ] No passo de completar por texto, mandar um nome que não existe na carteira → avisa e deixa tentar de novo
- [ ] Duas contas com nome parecido (ex.: "Nubank Ellen" e "Nubank Fernando") → digitar só "Nubank" é ambíguo; usar os botões resolve sem ambiguidade
- [ ] `/desfazer` sem nenhum lançamento recente → avisa que não achou nada, não quebra
- [ ] Mandar só um número depois de pedir ajuste de valor → não sequestra um lançamento novo digitado em seguida
- [ ] Lembrete diário chega (ou simular via cron manualmente)
- [ ] `/ajuda` lista as capacidades novas; menu de comandos do Telegram mostra `/ajuda`, `/desfazer`, `/id`

## Dividir (despesa em grupo) — ver DIVIDIR.md

- [ ] Criar grupo pelo app → aparece em "Meus grupos", você já é membro
- [ ] Gerar convite → abrir o link em janela anônima (sem conta) → pede login/cadastro, sem opção de visitante
- [ ] "Criar uma conta" a partir do convite → confirma e-mail (ou loga direto) → volta sozinho pro convite e entra no grupo
- [ ] Abrir o mesmo link já logado → oferece entrar com a conta, um toque só
- [ ] Reabrir um link de convite que você já usou (já é membro) → vai direto pro grupo, não pede pra entrar de novo
- [ ] Nova despesa "todos" vs "selecionados" → saldo reflete só quem participou
- [ ] Nova despesa "igual" vs "valor exato" (soma tem que bater, senão avisa)
- [ ] Registrar acerto entre dois membros → saldo dos dois zera certo
- [ ] Aba Saldo mostra a simplificação (menor nº de transferências), não uma lista de todo mundo com todo mundo
- [ ] Remover um membro → despesas antigas dele continuam aparecendo; ele some das próximas
- [ ] Tentar remover quem criou o grupo → recusa com mensagem clara
- [ ] `/iniciar` num grupo do Telegram novo → cria o grupo, primeiro membro registrado
- [ ] `/iniciar` de novo no mesmo grupo → avisa que já está conectado, não duplica
- [ ] `/conectar <token>` liga um grupo do Telegram a um grupo criado pelo app
- [ ] Entrar num grupo pelo site que TEM Telegram conectado → oferece "entrar no grupo do Telegram" (link individual), com opção de "agora não"
- [ ] Entrar no Telegram usando esse link individual → Carolina liga o Telegram à conta sozinha (checar em Ajustes › Integrações, ou tentar `/conectar` de novo — já devia aparecer conectado)
- [ ] Depois disso, mandar mensagem nesse grupo do Telegram → reconhecida como a MESMA pessoa do site, não vira membro duplicado
- [ ] Entrar num grupo pelo site que NÃO tem Telegram conectado → vai direto pro grupo, sem oferecer nada de Telegram
- [ ] Carolina sem permissão de admin no grupo do Telegram → botão "entrar no Telegram" não aparece (ou falha sem quebrar o resto do fluxo)
- [ ] Mandar "paguei o jantar, 180" no grupo → resumo com Confirmar/Cancelar, divide igual entre quem já apareceu
- [ ] Mandar foto de uma nota fiscal/comprovante no grupo → lê valor e estabelecimento, mesmo card de confirmação da despesa por texto
- [ ] Foto ilegível/que não é nota fiscal → avisa objetivamente, não trava nem inventa valor
- [ ] No card de confirmação (texto ou foto), tocar "✏️ Editar participantes" → lista com ✅/⬜ por membro
- [ ] Tocar num membro pra tirar da lista → card recalcula quem participa; "Pronto" volta pro card de confirmação com o texto atualizado
- [ ] Tentar tirar o último participante restante → não deixa esvaziar (sempre sobra pelo menos 1)
- [ ] Outra pessoa (não quem lançou) tentando editar participantes ou confirmar → recusa ("isso não é seu")
- [ ] "menos o Bruno" no texto já exclui direto, sem precisar abrir o editor depois
- [ ] "já paguei a Ana os 40" → vira acerto, não despesa
- [ ] "como ficou a divisão?" → responde com o saldo certo
- [ ] Mensagem de conversa normal do grupo (não relacionada a dinheiro) → Carolina fica quieta, não responde nada
- [ ] Dois membros diferentes confirmando ao mesmo tempo no mesmo grupo → não se atropelam
- [ ] Um membro tentar confirmar o botão de despesa de outro → recusa ("isso não é seu")
- [ ] Perguntar sobre carteira pessoal dentro do grupo → Carolina diz que não tem acesso ali, nunca inventa número
- [ ] Mesma pergunta de saldo no chat privado da carteira → funciona normal (confirma que os dois modos não vazam um pro outro)

## Mobile / PWA

- [ ] "Adicionar à tela inicial" no Android e no iOS — ícone e nome corretos, abre em tela cheia
- [ ] Nada colado no notch/indicador de home (safe-area)
- [ ] Todo modal de criar/editar abre como folha subindo da base no mobile

## Infra (depois de qualquer mudança em `api/`)

- [ ] `find api -type f -name "*.ts" ! -path "*/_lib/*" ! -name "_*" | wc -l` continua ≤ 12
- [ ] `/api/diag` responde ok (env vars presentes, Supabase e Telegram alcançáveis)
