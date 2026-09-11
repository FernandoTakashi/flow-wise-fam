# Bot do Telegram + débito automático + lembretes — setup

Implementa:

- **Débito automático** (`recurrences.autopay`): só um marcador visual — o cron NÃO
  lança nada sozinho; o pagamento é sempre marcado à mão. Aparece como tag no lembrete.
- **Lembretes diários** (Vercel Cron, 08:00 BRT): toda conta fixa de saída vencendo/
  atrasada e não paga chega no Telegram com botão **[Paguei]** (um lembrete por conta
  por dia).
- **Cérebro Haiku** (`api/_lib/brain.ts`): toda mensagem passa pelo Claude Haiku com um
  retrato da carteira (`api/_lib/context.ts` — saldos, resumo do mês, fixos em aberto,
  faturas, últimos lançamentos). Ele decide:
  - **lançar** ("ifood 42,90 crédito nubank", "tv 3000 em 10x nubank", "mercado 120 dividido")
    → resumo → **[Confirmar]**;
  - **responder** ("qual meu saldo?", "quanto falta pagar?", "quando vence a fatura?");
  - **marcar fixo pago** ("paguei o aluguel");
  - **pagar fatura de cartão** ("paguei a fatura do nubank") → resumo → **[Confirmar]**;
  - **cadastrar um fixo novo** ("cadastra academia 89,90 todo dia 10") → resumo → **[Confirmar]**;
  - **desfazer o último lançamento** ("desfaz", "cancela isso", ou `/desfazer`) → **[Sim, apagar]**.
  Sem `ANTHROPIC_API_KEY` cai num regex simples só para lançamento. Custo Haiku ≈ US$0,002/mensagem.

Arquitetura: `api/` (Vercel Functions) + `api/cron/reminders.ts` (Vercel Cron) +
`supabase/migrations/20260908000001_bot_autopay_reminders.sql`. Sem servidor dedicado.

---

## 1. Aplicar a migration

Só adiciona colunas (com default) e tabelas novas — **não** mexe em dados.

**SQL Editor:** cole `supabase/migrations/20260908000001_bot_autopay_reminders.sql` → Run.
Depois versione:

```sh
npx supabase migration repair --status applied 20260908000001
```

Ou via CLI: `npm run db:push`.

Tabelas novas: `chat_links`, `chat_link_tokens`, `chat_pending`, `notification_log`.
Colunas novas: `transactions.source`, `recurrences.autopay`.

## 2. Criar o bot

1. No Telegram, fale com **@BotFather** → `/newbot` → escolha nome e **username**
   (termina em `bot`, ex.: `MinhaGranaBot`).
2. Guarde o **token** (`123456:ABC-...`).
3. `/setprivacy` → **Disable** (deixa o bot ler mensagens normais no chat).

## 3. Variáveis de ambiente

No painel da Vercel → Project → Settings → Environment Variables (todas em Production):

| Nome | Valor |
|---|---|
| `VITE_SUPABASE_URL` | já existe |
| `VITE_SUPABASE_ANON_KEY` | já existe |
| `VITE_TELEGRAM_BOT_USERNAME` | `MinhaGranaBot` (sem @) |
| `SUPABASE_URL` | mesma URL do `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (secreta!) |
| `ANTHROPIC_API_KEY` | opcional — sem ela o parser usa regex |
| `TELEGRAM_BOT_TOKEN` | token do BotFather |
| `TELEGRAM_BOT_USERNAME` | `MinhaGranaBot` |
| `TELEGRAM_WEBHOOK_SECRET` | string aleatória longa (ex.: `openssl rand -hex 24`) |
| `CRON_SECRET` | outra string aleatória longa |
| `PUBLIC_APP_URL` | `https://SEU-APP.vercel.app` |

Para rodar local, espelhe em `.env` (veja `.env.example`).

## 4. Deploy

```sh
git add -A && git commit -m "bot telegram + autopay + lembretes"
vercel --prod           # ou push para a branch conectada
```

O `vercel.json` já registra o cron `/api/cron/reminders` às `0 11 * * *` (UTC = 08:00 BRT).

## 5. Registrar o webhook do Telegram

Uma vez, após o deploy:

```
https://SEU-APP.vercel.app/api/tg/set-webhook?key=<CRON_SECRET>
```

Deve responder `{ "ok": true, "webhook": ".../api/tg/webhook", "bot": "MinhaGranaBot" }`.

## 6. Conectar no app

App → **Ajustes → Integrações → Telegram → Gerar link de conexão** → abrir o link no
celular → **Iniciar**. O app detecta a conexão em alguns segundos.

Cada usuário conecta o seu chat; o vínculo aponta para a **carteira atual** no momento
da geração do link.

## 7. Testar

- **Lançamento:** mande `mercado 87,50` para o bot → confirmar → aparece em Saídas.
- **Lembrete:** cadastre um fixo de saída com vencimento hoje ou no passado e force o cron:
  ```
  https://SEU-APP.vercel.app/api/cron/reminders?key=<CRON_SECRET>
  ```
  (`&date=2026-09-10` simula outro dia). Retorna um resumo JSON; o Telegram recebe a
  lista com botões **[Paguei]**.

## Limitações conhecidas (v1)

- O lembrete olha só a ocorrência do **mês corrente** — uma conta que virou o mês
  sem pagar não é re-cobrada pelo bot (continua visível no Dashboard).
- Vercel Hobby: cron **1×/dia**, com possível atraso de alguns minutos.
- `[Editar]` no resumo de lançamento não existe: se o parse errou, é só mandar de novo.
- WhatsApp: o código tem um adaptador de canal (`api/_lib/telegram.ts`), mas o WhatsApp
  Cloud API ainda não está plugado (exige conta Meta Business + template aprovado).
