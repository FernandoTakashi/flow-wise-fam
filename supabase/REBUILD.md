# Reconstrução do banco — passo a passo

A migration [`migrations/20260907000001_rebuild_unified_model.sql`](migrations/20260907000001_rebuild_unified_model.sql)
**apaga o modelo antigo** (expenses, cash_movements, fixed_*, accounts, app_users…)
e cria o modelo novo (`transactions` unificada, RLS por carteira, onboarding no signup).

> A base de dados é zerada de propósito — o projeto vai recomeçar os cadastros.

## Ordem

### 1. Apagar os usuários de auth antigos
Painel do Supabase → **Authentication → Users** → selecionar todos → **Delete user**.
(Necessário para o trigger de onboarding criar carteira + categorias no próximo cadastro.)

### 2. Aplicar a migration

**Opção A — SQL Editor (mais rápido):**
Painel → **SQL Editor** → colar o conteúdo de `20260907000001_rebuild_unified_model.sql` → **Run**.
Depois, versione o resultado:
```sh
npx supabase login
npm run db:link          # pede a senha do banco (Settings → Database)
npx supabase migration repair --status applied 20260907000001
```

**Opção B — CLI (fluxo de migration):**
```sh
npx supabase login
npm run db:link
npm run db:push          # aplica a migration no projeto remoto
```

### 3. Conferir
```sh
npm run db:diff          # deve vir vazio (local == remoto)
```
No painel → **Table Editor**: devem existir `profiles`, `wallets`, `wallet_members`,
`accounts`, `categories`, `recurrences`, `card_invoices`, `transactions`,
`transaction_splits`, `investments`, `wallet_settings`.

### 4. Testar o onboarding
Criar uma conta nova no app. Deve nascer com:
- 1 carteira "Minha Carteira" (você como `owner`)
- 1 conta "Carteira" (kind `cash`)
- 13 categorias-semente

## O modelo novo (resumo)

| Tabela | Papel |
|---|---|
| `profiles` | 1:1 com `auth.users` |
| `wallets` + `wallet_members` | carteira compartilhada e seus membros |
| `accounts` | fontes de dinheiro: `cash` / `checking` / `card` |
| `categories` | por carteira, editáveis |
| `transactions` | **tudo** que entra/sai: `income` / `expense` / `transfer`, valor em `amount_cents` |
| `card_invoices` | 1 fatura por (cartão, mês) — calculada 1 vez, não re-derivada |
| `recurrences` | modelos recorrentes (ex-"fixos") que materializam `transactions` |
| `transaction_splits` | rateio de despesa entre membros (camada estilo Splitwise) |
| `investments` | aportes, `yield_rate_bps` (pontos-base, sem float) |
| `wallet_settings` | investimento inicial, rendimento padrão |

**Regra de ouro:** dinheiro sempre em centavos inteiros (`*_cents`); formatação só na UI.
Saldo de uma conta = `opening_balance_cents + Σ(transactions cleared até a data)`.
