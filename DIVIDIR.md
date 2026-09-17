# Dividir — despesa em grupo, apartada da carteira

Implementa o módulo descrito no dossiê ["Dividir"](https://claude.ai/artifact/Y4sKKfQ6HopRp5AwfHRJj3) publicado antes do
código: grupos ad-hoc pra dividir despesa, funcionando pelo app **e** por um
grupo do Telegram, com a mesma Carolina — sem nenhuma relação com
`wallets`/`accounts`/`transactions`.

## 1. Aplicar a migração

Adiciona 8 tabelas novas (`split_*`) e ajusta `handle_new_user()` pra
visitante anônimo não ganhar carteira pessoal de graça. Só isso, não mexe em
dado existente.

**SQL Editor do Supabase:** cole `supabase/migrations/20260917000001_split_dividir.sql` → Run.
(O mesmo trecho também está anexado em `supabase/APPLY_PENDING.sql`, se preferir aplicar por ali.)

Depois, versione: `npx supabase migration repair --status applied 20260917000001` (ou `npm run db:push`).

## 2. Pelo app

- Menu lateral → **Dividir contas** → cria um grupo, convida por link.
- Quem cria e quem entra pelo link precisam de conta no CaRe Wallet (login
  ou cadastro) — sem visitante anônimo. Login/cadastro aberto a partir do
  convite volta sozinho pro convite depois (o id viaja na própria URL).
- Nova despesa: escolhe quem pagou, quem participa (todos ou alguns) e se
  divide igual ou por valor exato.

## 3. Pelo Telegram (mesma Carolina, grupo diferente)

1. Adicione a Carolina a um grupo do Telegram (o mesmo bot da carteira —
   privacy mode já está desligado, ela lê as mensagens do grupo).
2. Alguém manda **`/iniciar`** — cria o grupo automaticamente (nome = título
   do grupo do Telegram) e já entra como primeiro membro. Se a pessoa já
   tiver conectado o Telegram pessoal dela à carteira, o grupo já nasce com
   dono de verdade; senão fica sem dono até alguém reivindicar pelo app.
   - Alternativa: crie o grupo pelo app, gere um convite (botão **Convidar**)
     e cole **`/conectar <token do link>`** num grupo do Telegram já existente
     pra ligar os dois.
3. A partir daí, é só mandar o que cada um gastou — `"paguei o jantar, 180"` —
   que ela divide igual entre quem já apareceu no grupo, mostra o resumo e
   pede confirmação.
4. `"já paguei a Ana os 40"` registra um acerto, não uma despesa nova.
5. `"como ficou a divisão?"` responde com o saldo simplificado.
6. A maioria das mensagens do grupo (conversa normal) é **ignorada
   silenciosamente** — a Carolina só fala quando é sobre despesa/acerto/saldo,
   ou se alguém pedir ajuda diretamente.

## Isolamento (por que isso é seguro)

- Roteamento por `chat.type` decide TUDO antes de tocar em qualquer tabela —
  chat privado nunca entra no caminho de código do grupo, e vice-versa.
- Tabelas `split_*` não têm nenhuma referência a `wallets`/`accounts`.
- O prompt do Haiku no modo grupo nem menciona carteira, fatura ou fixo —
  não tem como vazar o que não está no vocabulário que o modelo recebe.
- Pendência de confirmação é por **pessoa dentro do grupo**, não por chat —
  várias pessoas podem confirmar coisas ao mesmo tempo sem se atropelar, e só
  quem lançou pode tocar no próprio botão de confirmar.

Detalhe completo de cada camada: seção 06 do dossiê linkado acima.

## Limitações conhecidas (v1)

- Um pagador por despesa (duas pessoas que dividiram o pagamento na hora
  viram duas despesas separadas).
- Grupo criado por `/iniciar` sem ninguém com Telegram conectado à carteira
  fica sem "dono" pro app (arquivar/renomear pelo app não funciona até
  alguém reivindicar) — dividir despesa e ver saldo funciona normalmente.
- Sem leitura de foto de comprovante no modo grupo (só no chat privado).
- Sem casamento automático de identidade entre canais (alguém que participa
  pelo Telegram *e* pelo app com a mesma pessoa vira dois membros, a menos
  que já tenha conectado o Telegram pessoal à carteira — juntar os dois
  manualmente é feature futura).
