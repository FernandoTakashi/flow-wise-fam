# Ambientes: Produção e Staging (QA)

Hoje existe só **Produção** (`main` → `carewallet.cafemagia.dev.br`), com
dados reais das carteiras da família. Testar mudança nova diretamente ali é
arriscado — qualquer bug mexe com dinheiro de verdade. Este documento
descreve como montar um **Staging** isolado, reaproveitando o que já existe
em vez de duplicar infraestrutura.

## A ideia em uma frase

Mesmo repositório, mesmo projeto Vercel, uma branch `staging` — mas com
**Supabase, bot do Telegram e env vars próprios**, escopados só pra
"Preview" no Vercel. Zero risco de um teste vazar pra produção porque não
existe nenhuma credencial em comum entre os dois ambientes.

## Peças que precisam ser separadas

| Peça | Produção | Staging |
|---|---|---|
| Branch | `main` | `staging` (ou qualquer feature branch) |
| Deploy | Vercel — ambiente **Production** | Vercel — ambiente **Preview** (automático a cada push) |
| URL | `carewallet.cafemagia.dev.br` | URL de preview do Vercel, ou um domínio fixo tipo `staging.cafemagia.dev.br` |
| Banco | projeto Supabase atual | **projeto Supabase novo** (free tier) |
| Bot do Telegram | `@SeuFinanceBot` de verdade | **bot novo** criado no @BotFather só pra teste |
| E-mail (Resend) | domínio verificado | pode usar o SMTP padrão do Supabase (sem custom domain) — é só teste |

O que **não** precisa duplicar: o código é o mesmo repositório, o
`vercel.json`, os scripts, os testes — tudo isso já é compartilhado.

## Passo a passo

### 1. Criar o projeto Supabase de staging

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project** → nome
   `carewallet-staging` (free tier serve).
2. Puxa o schema completo de uma vez, direto do histórico de migrations que
   já está versionado:
   ```sh
   npx supabase link --project-ref <ref-do-projeto-staging>
   npm run db:push
   ```
   Isso aplica as 16 migrations em ordem, do zero — o staging nasce com o
   mesmo schema, RLS e triggers da produção.
3. Guarda a **Project URL** e a **anon key** (Settings → API) e a
   **service_role key** — vai precisar delas no passo 4.

### 2. Criar o bot de teste no Telegram

Mesmo processo do [BOT_SETUP.md](../BOT_SETUP.md#2-criar-o-bot): fala com
**@BotFather** → `/newbot` → escolhe um nome tipo `CaReWalletTestBot` →
guarda o token → `/setprivacy` → **Disable**.

### 3. Criar a branch

```sh
git checkout -b staging
git push -u origin staging
```

O Vercel já detecta a branch nova e cria um deploy de **Preview**
automaticamente a cada push nela (não precisa configurar nada pra isso
começar a acontecer).

### 4. Variáveis de ambiente no Vercel, escopadas certo

**Isso é o passo mais importante — sem ele, "staging" na prática ainda
seria produção.**

Vercel → Project → Settings → Environment Variables. As variáveis atuais
provavelmente estão marcadas pra **Production, Preview e Development** ao
mesmo tempo (é o padrão ao criar uma variável pela UI) — o que significa
que hoje um deploy de Preview já pode estar lendo o banco e o bot de
produção. Precisa:

1. Editar cada variável existente (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_APP_URL`,
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TELEGRAM_BOT_USERNAME`)
   → desmarcar **Preview** e **Development**, deixando só **Production**.
2. Adicionar as mesmas variáveis de novo, com os valores do staging
   (projeto Supabase novo, bot novo, `PUBLIC_APP_URL` = a URL do preview ou
   do domínio fixo do passo 6), marcadas só pra **Preview**.
3. `ANTHROPIC_API_KEY` pode ser a mesma nos dois ambientes (não tem dado
   sensível de carteira nela) ou ficar de fora do staging — sem ela o bot
   de teste cai no modo regex, o que ainda serve pra testar o fluxo de
   lançamento.
4. `CRON_SECRET` pode ser um valor novo só pra staging, ou reusar — protege
   só o `/api/diag` e o cron, não é segredo de dado.

### 5. Registrar o webhook do bot de teste

Depois do primeiro deploy da branch `staging`:

```
https://<url-do-preview>/api/tg/set-webhook?key=<CRON_SECRET-do-staging>
```

Isso registra o webhook só do **bot de teste**, apontando só pra essa URL —
não encosta no bot de produção (tokens diferentes, endpoints diferentes).

### 6. (Opcional) Domínio fixo pro staging

URLs de preview do Vercel mudam a cada commit (`flow-wise-fam-git-staging-...`).
Pra ter um endereço estável pra testar (e pra registrar o webhook do bot
uma vez só), dá pra fixar um domínio na branch:

1. Cloudflare → adiciona um CNAME `staging.cafemagia.dev.br` → mesma target
   usada pro `carewallet` (`cname.vercel-dns.com`, confirmar no painel).
2. Vercel → Project → Domains → adiciona `staging.cafemagia.dev.br` →
   em "Git Branch", associa a `staging`.

Com isso, todo push na branch `staging` publica sempre no mesmo endereço.

## Fluxo de trabalho

```
feature/xyz → push → CI roda (typecheck/build/test/lint) → PR pra staging
  → merge → deploy automático em staging.cafemagia.dev.br
  → roda o docs/QA_CHECKLIST.md ali
  → tudo certo → PR de staging pra main → merge → produção
```

O CI (`.github/workflows/ci.yml`) roda em toda branch e todo PR — pega
regressão de tipo/lint/build antes até de chegar no Vercel. O checklist
manual (`docs/QA_CHECKLIST.md`) é o que cobre fluxo real e bot, que os
testes automatizados ainda não cobrem.

## O que fica de fora por enquanto

- **Testes E2E automatizados** (Playwright) rodando contra o staging — dá
  pra evoluir pra isso depois; hoje o checklist manual cobre.
- **Seed de dados de teste automático** no staging — pode usar o próprio
  onboarding pra gerar uma carteira de teste, ou adaptar
  `supabase/CLONE_WALLET.sql` pra clonar uma carteira real (sem dados
  sensíveis) de produção pra dentro do staging.
