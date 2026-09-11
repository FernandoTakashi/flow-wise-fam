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
- [ ] Mandar só um número depois de pedir ajuste de valor → não sequestra um lançamento novo digitado em seguida
- [ ] Lembrete diário chega (ou simular via cron manualmente)

## Mobile / PWA

- [ ] "Adicionar à tela inicial" no Android e no iOS — ícone e nome corretos, abre em tela cheia
- [ ] Nada colado no notch/indicador de home (safe-area)
- [ ] Todo modal de criar/editar abre como folha subindo da base no mobile

## Infra (depois de qualquer mudança em `api/`)

- [ ] `find api -type f -name "*.ts" ! -path "*/_lib/*" ! -name "_*" | wc -l` continua ≤ 12
- [ ] `/api/diag` responde ok (env vars presentes, Supabase e Telegram alcançáveis)
