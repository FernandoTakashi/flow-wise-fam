# FinanceApp (flow-wise-fam)

Gestão financeira pessoal **colaborativa**: várias "carteiras" (contas), cada uma com
múltiplos membros. Controle de saldo, gastos fixos e variáveis, entradas fixas,
cartões de crédito, investimentos, projeção e relatórios.

**Stack:** Vite + React 18 + TypeScript + shadcn/ui (Radix) + Tailwind +
React Router 6 + Recharts + Supabase (auth + Postgres).

Projeto originalmente gerado no [Lovable](https://lovable.dev/projects/2122d0c9-c2e8-47e3-9921-32464f1e1434).

---

## Rodando localmente

Requisitos: Node.js 20+ e npm.

```sh
npm install
cp .env.example .env   # preencha com os dados do seu projeto Supabase
npm run dev            # http://localhost:8080
```

Variáveis de ambiente (ver `.env.example`):

| Variável | Onde achar |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard > Project Settings > API > Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard > Project Settings > API > anon/public key |

Scripts úteis:

```sh
npm run build       # build de produção (gera dist/)
npm run preview     # serve o build local
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
```

---

## Banco de dados (Supabase)

O schema e as policies de RLS vivem no projeto Supabase. Para versioná-los neste
repositório e poder recriar tudo depois:

```sh
# 1. Autentica a CLI (abre o navegador; gera um token pessoal)
npx supabase login

# 2. Liga este repositório ao projeto remoto (pede a senha do banco)
npm run db:link

# 3. Puxa o schema atual para supabase/migrations/
npm run db:pull

# 4. Commit
git add supabase/migrations && git commit -m "chore: snapshot do schema Supabase"
```

Depois disso:

- `npm run db:diff` — mostra diferenças entre o remoto e as migrations locais.
- `npm run db:push` — aplica migrations locais no remoto.

> **Free tier:** o projeto pausa após ~7 dias sem requisições. Reative pelo
> dashboard. Com o schema em `supabase/migrations/` você consegue recriar o
> projeto do zero se necessário.

---

## Deploy

Configurado para **Vercel** (`vercel.json` faz o rewrite de SPA).

1. Importe o repositório na Vercel.
2. Configure as env vars `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Build command `npm run build`, output `dist`.

Alternativas: Netlify, Cloudflare Pages (mesmo build, adicionar rewrite `/* -> /index.html`).
