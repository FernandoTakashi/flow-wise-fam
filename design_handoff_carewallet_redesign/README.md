# Handoff: Redesign do CaRe Wallet

## Visão geral
Redesign visual e de hierarquia do app **CaRe Wallet** (`FernandoTakashi/flow-wise-fam`, branch `main`) — app de finanças da família em React + Vite + Tailwind + shadcn/ui + Supabase.

Objetivos declarados pelo cliente: **mais credibilidade, visual mais moderno, melhor no celular**. O modelo de dados, os fluxos e a informação exibida **não mudam** — tudo o que aparece no redesign já existe no código (competência, previsão de fatura, linhas Variável/Fixo/Previsto, acerto entre membros, fechamento de período, bot do Telegram). O que muda é a hierarquia visual, o shell da aplicação e o layout mobile.

## Sobre os arquivos de design
Os arquivos deste pacote são **referências de design feitas em HTML** — protótipos que mostram aparência e comportamento pretendidos, **não código de produção para copiar**. A tarefa é **recriar esses designs dentro do codebase existente** (React 18 + TypeScript + Tailwind + shadcn/ui), usando os componentes e padrões já estabelecidos: `Card`, `Button`, `Badge`, `Progress`, `Tabs`, `Dialog`, `Select`, `lucide-react` para ícones, tokens HSL em `src/index.css`.

Nada de reescrever a lógica: `FinanceContext` e as páginas continuam donos do comportamento. As mudanças são de **markup, classes Tailwind e tokens**.

## Fidelidade
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, raios e estados são finais. Reproduza fielmente usando as classes/tokens do projeto.

Ressalva: os **números** nos protótipos são de exemplo (vindos do print do cliente e de cálculos plausíveis). Toda a data vem do `FinanceContext` como já vem hoje.

---

## Mudanças de tokens (`src/index.css`)

O redesign mantém a paleta coral + creme, mas **escurece o shell** e ajusta alguns valores. Adicione/ajuste no `:root`:

| Token | Antes | Depois | Uso |
| --- | --- | --- | --- |
| `--background` | `24 42% 97%` | mantém (`#FAF6F2`) | fundo do conteúdo |
| `--foreground` | `340 20% 18%` | `20 20% 11%` → `#221A17` | tinta principal (menos rosada) |
| `--muted-foreground` | `20 10% 44%` | **mantém** (`#7E6E66`) | textos secundários — não clarear: 4,96:1 é o piso de contraste |
| `--primary` | `8 82% 61%` | mantém (`#EF6A52`) | coral de ação |
| `--primary-dark` | `6 66% 47%` | `9 68% 53%` → `#D95439` | hover de botão coral |
| `--accent` | `174 44% 40%` | mantém (`#2F8F8A`) | teal: links, "ver todos", sucesso frio |
| `--border` | `26 22% 88%` | `26 20% 89%` → `#EAE1DA` | bordas de card |
| `--sidebar-background` | `30 44% 98%` | **`20 20% 11%`** → `#221A17` | **sidebar agora é escura** |
| `--sidebar-foreground` | `340 20% 18%` | `26 24% 96%` → `#FAF6F2` | texto da sidebar |
| `--radius` | `0.75rem` | `0.875rem` (cards: `1.125rem`) | cantos mais suaves |

**Tokens novos:**
```css
--ink: 20 20% 11%;          /* #221A17 — shell escuro, hero, botões neutros */
--ink-2: 20 16% 16%;        /* #31241F — cards dentro do shell escuro */
--ink-border: 20 14% 18%;   /* #362A25 — divisores no escuro */
--on-ink: 26 24% 96%;       /* #FAF6F2 */
--on-ink-muted: 20 12% 58%; /* #9C8A80 — 4,75:1 sobre --ink. Não clarear */
--pos: 152 46% 66%;         /* #7FD3A8 — valores positivos no escuro */
--neg: 12 100% 76%;         /* #FF9C82 — valores negativos no escuro */
```

### Contraste — regra obrigatória
Três valores foram corrigidos durante a revisão e **não devem ser clareados**:
- Texto secundário sobre branco/creme: `#7E6E66` (4,96:1). Nunca `#8A7A72`.
- Texto secundário sobre o shell escuro: `#9C8A80` (4,75:1). Nunca `#8E7C73`.
- `#A9968C` só para **placeholder** de input. Conteúdo real (ex.: o deep link do Telegram) usa `#5C4C45`.

## Tipografia

Já configurada em `tailwind.config.ts` — o redesign apenas **usa de verdade** o par que já existe:

- **Display** (`font-display`): `Bricolage Grotesque`, weight 700, `letter-spacing: -0.02em` a `-0.03em`. Títulos de página, títulos de card, todos os números-herói.
- **Corpo** (`font-sans`): `Hanken Grotesk`, 400/500/600/700.
- Todo valor monetário: `tabular-nums` + `font-bold`.

Escala usada:

| Papel | Tamanho | Peso | Fonte |
| --- | --- | --- | --- |
| Número-herói (dashboard) | 52px / 44px mobile | 700 | display |
| Número-herói de card (fatura) | 32-34px | 700 | display |
| Título de página | 19px | 700 | display |
| Título de card | 15.5px | 700 | display |
| KPI | 21-22px | 700 | sans |
| Corpo / linha de lista | 14px | 600 | sans |
| Meta / subtítulo | 11.5-12.5px | 400-600 | sans |
| Label uppercase | 10.5-11.5px, `letter-spacing .06em–.13em` | 700 | sans |

Garanta que as duas famílias estão realmente carregadas (Google Fonts em `index.html` ou self-host) — hoje o CSS as declara mas o app pode estar caindo no fallback.

---

## Telas

### 1. Shell da aplicação (`src/components/Layout.tsx`, `Sidebar.tsx`)

**Layout:** grid `252px minmax(0,1fr)`, altura total da viewport.

**Sidebar** (`#221A17`, padding `20px 14px`, gap 22px, coluna flex):
- **Topo:** mascote 36px, `border-radius: 11px`, fundo `#EF6A52`, padding 3px. Ao lado: "CaRe Wallet" (display, 16px/700, `#FAF6F2`) + "Finanças da família" (11.5px, `#9C8A80`, `nowrap`).
- **CTA:** botão "Novo lançamento" full-width, 44px, `radius 12px`, `#EF6A52`, texto branco 14.5px/600, ícone `Plus` 20px. Hover `#D95439`. É o único CTA coral da sidebar.
- **Navegação em 3 grupos** com cabeçalho uppercase 10.5px/700, `letter-spacing .13em`, `#6E5C54`, padding `0 10px`, margin-bottom 6px:
  - **Dia a dia** — Dashboard (`LayoutDashboard`), Lançamentos (`ArrowDownCircle`, badge com a contagem do mês), Receitas (`ArrowUpCircle`), Gastos fixos (`Repeat`, badge com pendentes), Cartões (`CreditCard`, badge com nº de cartões)
  - **Patrimônio** — Investimentos (`PiggyBank`), Projeção (`TrendingUp`)
  - **Fechamento** — Relatórios (`BarChart3`), Acerto de contas (`Scale`), Ajustes (`Settings`)
  - Ordem e rotas idênticas ao `NAV_ITEMS` atual — só o agrupamento é novo.
- **Item de nav:** altura 40px, gap 11px, `radius 10px`, ícone 19px, label 13.5px.
  - inativo: `color #BCA79C`, weight 500, fundo transparente; hover `background #31241F; color #FAF6F2`
  - ativo: `background #EF6A52`, `color #fff`, weight 700
  - badge: 11px/700 `tabular-nums`, `#9C8A80` (inativo) / `#fff` opacity .85 (ativo), alinhado à direita
- **Rodapé:** `border-top 1px solid #362A25`, padding `12px 10px 4px`. Avatar 32px circular `#3B2D27` com iniciais 12.5px/700 `#E4B8A9`; nome 13px/600 `#FAF6F2`; nome da carteira 11px `#9C8A80`; ícone `LogOut` 19px `#9C8A80`, hover `#EF6A52`.

**Header** (64px, `border-bottom 1px solid #EAE1DA`, fundo `#FAF6F2`, padding `0 32px`, gap 16px):
- Esquerda (flex 1): título da página (display 19px/700) + subtítulo (12px `#7E6E66`). Substitui o `PageHeader` dentro do conteúdo — o título sobe para o header.
- **MonthSelector** (centro): pill branca, `border 1px #EAE1DA`, `radius 999px`, padding 4px. Chevrons em botões circulares 30px (hover `background #F3EBE5`); label 13.5px/600, `min-width 124px`, centralizado, "setembro 2026". Clicar no label volta ao mês atual (comportamento atual mantido).
- **WalletSelector** (direita): pill branca 38px, padding `0 14px`, ícone `Wallet` 17px coral, nome 13.5px/600, `ChevronDown` 17px `#A9968C`.
- O botão "Sair" sai do header e vai para o rodapé da sidebar.

**Conteúdo:** `overflow-y auto`, padding `28px 32px 40px`, colunas em grid com gap 16px.

---

### 2. Dashboard (`src/pages/Dashboard.tsx`)

**Hero** — substitui os 4 cards de KPI com borda-esquerda colorida:
- Card `#221A17`, `radius 18px`, padding `24px 26px`, flex row, `align-items: flex-end`, `justify-content: space-between`, gap 32px.
- **Esquerda:** label "Projeção fim do mês" (12.5px/600 uppercase `letter-spacing .06em`, `#A9968C`) + valor `summary.projectedBalanceCents` em display 52px/700, `letter-spacing -.03em`, `#FAF6F2`, `tabular-nums` + linha explicativa 13.5px `#BCA79C`: "Saldo em caixa depois de quitar tudo o que tem competência em {mês}."
- **Direita:** três blocos (gap 30px, `padding-bottom 6px`), cada um com label uppercase 11.5px `#9C8A80` `nowrap`, valor 21px/700 `tabular-nums` e hint 11.5px `#9C8A80`:
  - Saldo em caixa — `#FAF6F2` — "hoje, regime de caixa"
  - A receber — `#7FD3A8` — "entradas previstas"
  - A pagar — `#FF9C82` — "fixos + faturas + previstos"
- Badge "mês fechado" (quando `isPeriodLocked`): mantém o comportamento, renderizada no header da página.

**Grid inferior:** `minmax(0,1.15fr) minmax(0,1fr)`, gap 16px, `align-items: start`.

**Card "A pagar"** (coluna larga) — branco, `border 1px #EAE1DA`, `radius 18px`, `overflow hidden`:
- Header: padding `18px 22px 12px`; título display 15.5px/700; sub 12px `#7E6E66` "Fixos e faturas de {mês} · {total}"; à direita link "Ver gastos fixos" 12.5px/600 `#2F8F8A`.
- Linhas: `border-top 1px solid #F1E8E1`, padding `13px 22px`, gap 13px, hover `background #FDFAF8`.
  - Ícone em tile: 20px, `radius 9px`, padding 6px. `Repeat` para recorrência, `CreditCard` para fatura. Tons: atrasado → `#C8452F` sobre `#FBE9E4`; recorrência normal → `#8A6A57` sobre `#F4EDE7`; fatura → `#2F8F8A` sobre `#E7F2F1`.
  - Nome 14px/600; meta 11.5px `#7E6E66` — compõe os atributos reais: `Fixo · vence dia {day}` (ou "vence no último dia"), `· no cartão`, `· conta chegou` (status pending), `· compartilhado` (`recurrence.shared`), `· débito automático` (`recurrence.autopay`); para fatura: `Aberta|Fechada · fecha dia {closingDay}` / `vence dia {dueDay}`.
  - Valor à direita: 14.5px/700 `tabular-nums`; abaixo, quando `amountCents !== estimatedCents` ou `projected > posted`, uma segunda linha 11px `#7E6E66`: "previsto R$ …" / "prev. R$ …" (substitui o `line-through` atual).
  - Botão: 31px, `border 1px #E2D7CF`, branco, `radius 9px`, 12.5px/600 `#5C4C45`, hover `border-color #EF6A52; color #D24E36`. Label: "Paguei" / "Lançar" (no cartão) / "Pagar" (fatura). `disabled` quando o mês está fechado.

**Coluna direita:**
- **Card "A receber"** — mesma estrutura; ícone `TrendingUp` `#2A8F63` sobre `#E8F5EE`; valor `#1F7A52`; botão "Recebi" com hover verde (`#2A8F63` / `#1F7A52`).
- **Card "Quem gastou mais" + "Divisão entre membros"** (um card, duas seções): título display 15.5px/700 + sub "Despesas com competência em {mês}". Barras: track 7px `#F1E8E1` `radius 99px`; preenchimento `#221A17` no primeiro colocado, `#C6B4AA` nos demais; nome 13px/600 e valor 13px `#7E6E66` `tabular-nums` acima. Divisor `border-top 1px #F1E8E1` e label uppercase 12.5px/700 `#7E6E66` "Divisão entre membros"; cada saldo numa faixa `#F4F9F7`, `border 1px #DCEDE7`, `radius 12px`, padding `12px 14px`: "{nome} tem a receber" / "{nome} deve" 13px/600 `#1F6B67` + valor 15px/700 `#1F6B67`.
- Ambas as seções só aparecem quando há dados (mesma condição de hoje).

Os dois `Dialog` (pagar fatura / confirmar fixo) **não mudam de conteúdo** — só herdam os novos tokens de botão e radius.

---

### 3. Lançamentos (`src/pages/Transactions.tsx`)

Passa de lista de cards para **tabela densa** (mantendo o card-list no mobile).

**Tiles do topo:** grid 3 colunas, gap 14px, `radius 16px`, padding `16px 18px`. Label 11.5px/600 `#7E6E66`, valor 22px/700 `tabular-nums`.
- "Saídas de {mês}" → `#C8452F`
- "Entradas de {mês}" → `#1F7A52`
- "Resultado do mês" → card `#221A17`, label `#9C8A80`, valor `#FF9C82` quando negativo / `#7FD3A8` quando positivo
(O terceiro tile é o `totals.net` atual; o segundo usa `totals.income` — hoje só um dos dois aparece por rota.)

**Barra de ferramentas:** campo de busca (novo, filtra em memória por `description`, nome da conta e categoria) — 40px, branco, `border 1px #EAE1DA`, `radius 11px`, ícone `Search` 19px `#A9968C`, placeholder 13.5px `#A9968C`. À direita, segmented Saídas/Entradas: trilha `#F1E8E1` `radius 11px` padding 3px; item ativo `#221A17`/`#FAF6F2` 700, inativo `#5C4C45` 600, 34px, padding `0 16px`, `radius 9px`. Substitui a navegação por rota separada (Lançamentos vs Receitas) por um toggle na mesma tela — as rotas continuam existindo.

**Tabela:** `grid-template-columns: 78px minmax(0,1fr) 132px 124px 104px 122px`, gap 12px, padding `13px 22px`.
- Cabeçalho: `background #FDFAF8`, `border-bottom 1px #EAE1DA`, 11px/700 uppercase `letter-spacing .1em` `#7E6E66`: Data · Descrição · Conta · Categoria · Quem · Valor (à direita).
- Linha: `border-bottom 1px #F4EDE7`, hover `background #FDFAF8`; `opacity .62` quando `status === 'pending'` (substitui o `border-dashed`).
- Data: 13px `#5C4C45` `tabular-nums`, `formatDayMonth`.
- Descrição: bolinha 8px (`#2A8F63` income, `#EF6A52` expense, `#C6B4AA` transfer) + texto 14px/600 truncado. Depois, quando aplicável: badge de parcela (`installmentNo/installmentOf`) 10.5px/700 `#7E6E66`, `border 1px #E2D7CF`, `radius 99px`, padding `1px 6px`; ícone `Users` 15px `#2F8F8A` se `splits.length > 0`; pill "conta chegou" 10.5px/700 `#8A6A57` sobre `#F4EDE7` para pending.
- Conta / Categoria: 12.5px `#5C4C45`, truncados (`accountName`, `categoryName`).
- Quem: 12.5px `#5C4C45`, primeiro nome (`memberName(...).split(' ')[0]`), "—" quando nulo.
- Valor: alinhado à direita, 14px/700 `tabular-nums`. `+` e verde `#1F7A52` para income; `−` e `#221A17` para expense; sem sinal e `#7E6E66` para transfer.
- Editar/excluir saem da linha e vão para o menu de contexto / hover (ou mantenha os `ghost icon buttons` numa 7ª coluna de 72px se preferir menos mudança).
- Rodapé: padding `14px 22px`, 12.5px `#7E6E66` — "Competência de {mês} · {n} de {total} lançamentos" + "Carregar mais" 600 `#2F8F8A`.

**EmptyState:** mantém o componente atual, só herda os tokens.

---

### 4. Cartões (`src/pages/Cards.tsx`)

**Stats globais:** grid 4 colunas, gap 14px, cards brancos `radius 16px` padding `16px 18px`. Label 11.5px/600 `#7E6E66` `nowrap`, valor 21px/700 `tabular-nums`.
- Limite total (`#221A17`) · Comprometido (`#221A17`) · Disponível (`#1F7A52`) · Faturas de {mês} (`#2F8F8A`, com sub 11px `#7E6E66` "prev. R$ …" quando `projected > posted`).

**Card de cartão** — branco, `border 1px #EAE1DA`, `radius 18px`, `overflow hidden`, em grid de 2 colunas:
- **Cabeçalho escuro** (`#221A17`; use `#33262F` para alternar visualmente entre cartões), padding `20px 22px 18px`:
  - Nome display 19px/700 `#FAF6F2`; "Fecha dia {closingDay} · vence dia {dueDay}" 12px `#9C8A80`.
  - Badge de status à direita, 11px/700 uppercase `radius 99px` padding `5px 10px`: Aberta → `#3B2D27`/`#E4D8D1`; Fechada → `#4A3A2A`/`#F2C98A`; Paga → `#1F5A3E`/`#9FE0BE`.
  - Bloco de valores (margin-top 22px, `align-items: flex-end`, space-between): "Fatura atual" (label 11px/700 uppercase `#9C8A80`) + `postedCents` display 32px/700 `#FAF6F2`; à direita "Previsão" + `projectedCents` 17px/700 `#BCA79C`.
  - Quando `projected > posted`: linha 12px `#FFB39F` — "+ {diferença} em fixos ainda não lançados".
- **Corpo** (padding `16px 22px 18px`, gap 14px):
  - Utilização: linha "Utilizado do limite de {limite}" 12.5px `#7E6E66` + valor 12.5px/700; track 8px `#F1E8E1` `radius 99px`; preenchimento `#EF6A52`, `#E08A3C` acima de 70%, `#C8452F` acima de 90% (mesmos limiares do código atual); abaixo, "Disponível {valor}" 11.5px/600 `#1F7A52` à direita.
  - Lançamentos da fatura: label uppercase 11.5px/700 `#7E6E66` "Lançamentos da fatura ({view.rows.length})"; lista sempre visível (não mais accordion) com as 4-5 primeiras linhas + "Ver todos". Cada linha: tag 10px/700 uppercase, `border 1px #E2D7CF`, `radius 99px`, largura fixa 56px centralizada — Variável / Fixo / Previsto (`ROW_LABEL`); descrição truncada 12.5px; data `#A9968C`; valor 700 `tabular-nums`. Linhas `projected` em `#B35A3A` com borda `#F0C9B8`.
  - Ações: "Pagar fatura" coral flex-1 38px (ou "Estornar pagamento" quando paga, `disabled` se `postedCents <= 0`); "Fechar fatura"/"Reabrir fatura" outline; ícone `Pencil` 38px quadrado; excluir permanece no menu/`ConfirmDialog`.

Dialogs de novo cartão e pagar fatura: sem mudança de conteúdo.

---

### 5. Projeção (`src/pages/Projection.tsx`)

Mantém o horizonte de 12 meses e todo o cálculo atual.

**KPIs:** grid 4, gap 14px, `radius 16px`, padding `16px 18px`. Patrimônio hoje (branco) · **Em 12 meses (card `#221A17`, valor `#FAF6F2`)** · Crescimento (`#1F7A52`/`#C8452F`) · Retorno % (idem). Label 11.5px/600, valor 22px/700 `tabular-nums`.

**Gráfico:** substitui o `LineChart` por **colunas empilhadas** de 13 meses (o mês atual + 12) — mais legível que duas linhas em card estreito. Se preferir manter `recharts`, use `BarChart` + duas `Bar` com `stackId`.
- Container branco `radius 18px` padding `22px 24px`, gap 20px. Header: título display 15.5px/700 "Curva de evolução" + sub 12px `#7E6E66` "Cenário base para os próximos 12 meses"; legenda à direita: quadrado 10px `radius 3px` `#EF6A52` "caixa", `#2A8F63` "investido".
- Área do gráfico: 230px de altura, gap 11px, `padding-bottom 24px`, `border-bottom 1px #EAE1DA`.
- Coluna: largura máx. 44px, altura proporcional ao maior `total`, `radius 8px 8px 3px 3px`, `overflow hidden`. Segmento superior `#2A8F63` com altura `invested/total`; segmento inferior `#EF6A52` (flex 1) — `#D24E36` no mês atual.
- Rótulo do valor acima da coluna: 10.5px/700 `tabular-nums`, `#5C4C45` (`#D24E36` no mês atual), valor arredondado sem centavos. Rótulo do mês abaixo (`absolute; bottom: -22px`): 11.5px/600 `#7E6E66` / `#D24E36` no atual.

**Tabela:** `grid-template-columns: 96px repeat(6, minmax(0,1fr))`, gap 10px, padding `12px 22px`, `border-bottom 1px #F4EDE7`. Cabeçalho igual ao de Lançamentos. Colunas: Mês · Entradas (`+`, `#1F7A52`) · Saídas (`−`, `#C8452F`) · Rendimento (`#5C4C45`, "—" quando zero) · Investido · Caixa · **Total (700)**. Linha do mês atual com `background #FDFAF8` e pill "atual" 9.5px/700 uppercase ao lado do label.

**Nota de metodologia:** 12px/1.5 `#7E6E66`, `max-width 720px` — texto idêntico ao atual.

---

### 6. Ajustes (`src/pages/Settings.tsx`)

As **7 abas continuam as mesmas** (`perfil, carteiras, contas, categorias, membros, períodos, integrações`), só ganham a aparência de segmented: trilha `#F1E8E1` `radius 12px` padding 4px, `align-self: flex-start`, `flex-wrap`; item 34px padding `0 15px` `radius 9px` 13.5px, `text-transform: capitalize`; ativo `#221A17`/`#FAF6F2` 700, inativo `#5C4C45` 600.

Conteúdo em grid de 2 colunas, gap 16px, `align-items: start`.

**Membros** (card branco): header display 15.5px/700 + sub "Quem enxerga e lança em {carteira}". Linhas `border-top 1px #F1E8E1` padding `13px 22px`: avatar 38px circular (dono `#221A17`/`#E4B8A9`, membro `#EF6A52`/`#fff`, iniciais 13px/700), nome 14px/600, e-mail 11.5px `#7E6E66`, papel em pill uppercase 11.5px/700 `#7E6E66` sobre `#F3EBE5`. Rodapé: input de e-mail (38px, `#FDFAF8`, `border 1px #EAE1DA`, `radius 10px`) + botão "Convidar" `#221A17`/`#FAF6F2` 38px.

**Integrações · Telegram** (card branco): ícone `Send` 20px `#2F8F8A` em tile `#E7F2F1` `radius 9px` + título display 15.5px/700 "Telegram" + sub "Lance gastos por mensagem, sem abrir o app".
- Estado conectado: faixa `#F4F9F7`, `border 1px #DCEDE7`, `radius 12px`, padding `12px 14px` — `CheckCircle` 19px `#1F6B67`, "Conectado a @{username}" 13px/600 `#1F6B67`, "Vinculado à carteira {nome}" 11.5px `#3E8B85`, ação "Desconectar" 12.5px/600 `#7E6E66`.
- Gerar link: label uppercase 11.5px/700 `#7E6E66` "Conectar outro chat"; campo monospace 12.5px **`#5C4C45`** (conteúdo real, não placeholder) truncado + botão "Copiar" `#2F8F8A` 38px; hint 11.5px `#7E6E66` "Abra no celular com o Telegram instalado e toque em Iniciar. Expira em 10 min."
- Mantém o aviso de `VITE_TELEGRAM_BOT_USERNAME` ausente.

**Períodos** (card `#221A17`): título display 15.5px/700 `#FAF6F2` "Períodos · {mês} {ano}"; corpo 12.5px/1.45 `#BCA79C` explicando o lock; botões "Fechar {mês}" coral 38px e "Ver meses fechados" outline `border 1px #4A3A33` `color #E4D8D1`.

---

### 7. Mobile (390 × 844)

**Login (`src/pages/Auth.tsx`)** — sai o card centralizado com tabs, entra tela cheia:
- Fundo `#FAF6F2`, conteúdo centralizado vertical, padding `0 26px 40px`, gap 26px.
- Mascote 60px, `radius 18px`, fundo coral, padding 5px.
- Título display 32px/700 `line-height 1.08` `letter-spacing -.025em`: "Finanças da família,<br>sem planilha." + parágrafo 14.5px/1.45 `#5C4C45`.
- Campos: label 12.5px/600 `#5C4C45`; input **52px** (era 44px), branco, `border 1px #E2D7CF`, `radius 14px`, texto 15px; senha com toggle `Eye` 20px `#A9968C`.
- Botão "Acessar conta": 54px, coral, `radius 14px`, 16px/700.
- Rodapé da tela: "Esqueci minha senha" (13.5px `#7E6E66`) à esquerda e "Criar conta" (13.5px/700 `#2F8F8A`) à direita — as tabs Entrar/Criar conta viram esse link.

**Dashboard mobile:**
- **Header escuro** `#221A17`, padding `46px 20px 22px`, gap 16px: pill de carteira (`#31241F`, 36px, `radius 99px`) e month selector compacto ("set 26") na mesma linha; label uppercase 12px `#9C8A80` + valor display 44px/700 `#FAF6F2`; três mini-cards `#31241F` `radius 13px` padding `11px 12px` (label 10.5px uppercase `#9C8A80`, valor 15px/700 — Em caixa `#FAF6F2`, A receber `#7FD3A8`, A pagar `#FF9C82`, sem centavos).
- **Lista "A pagar em setembro":** título display 17px/700 + "Ver tudo" 13px/600 `#2F8F8A`; cards brancos `border 1px #EAE1DA` `radius 15px` padding `13px 14px` gap 10px — tile de ícone 20px, nome 14.5px/600 truncado, meta 11.5px `#7E6E66` truncada, valor 15px/700 e ação ("Paguei"/"Lançar"/"Pagar") 12px/700 `#D24E36` empilhados à direita. **Toda a área do card é o alvo de toque** (≥ 48px de altura).
- **Tab bar** 86px, `#FAF6F2`, `border-top 1px #EAE1DA`, 5 itens de 64px: Início (`space_dashboard`), **Lançar (ícone 30px coral, central)**, Fixos (`autorenew`), Cartões (`credit_card`), Mais (`menu`). Ícone 25px, label 10.5px/600; ativo `#D24E36`, inativo `#7E6E66`. Substitui a tab bar de 4 itens + Menu atual; o item "Mais" abre o mesmo grid de navegação em tela cheia que já existe.

**Nova saída (bottom sheet)** — o `Dialog` de `Transactions.tsx` no mobile:
- Sheet `#FAF6F2`, `radius 28px 28px 0 0`, altura ~700px, padding `14px 22px 30px`, gap 16px, sobre backdrop `#5A4B44`. Handle 44×5px `#DDD1C9` centralizado.
- Título display 24px/700 "Nova saída" + sub 13px `#7E6E66` com o nome da carteira.
- **Valor em destaque:** label uppercase 12px `#7E6E66` + display 46px/700 `tabular-nums`, centralizado, `border-bottom 1px #EAE1DA` (o `MoneyInput` estilizado como display, teclado numérico do sistema).
- Campos de 52px, brancos, `radius 14px`, `border 1px #E2D7CF`, ícone `#A9968C` 20px + valor 14.5-15px/600: descrição; categoria + data (lado a lado); conta ("Cartão · {nome}"); responsável + parcelas (lado a lado).
- **Aviso de competência** quando a conta é cartão: faixa `#F3EBE5` `radius 12px` padding `11px 14px`, ícone `Info` 18px `#8A6A57`, texto 12px `#5C4C45` — "Compra no cartão entra na competência da fatura de **{mês} {ano}**" (`resolveInvoiceRef`).
- **Gasto compartilhado:** faixa `#F4F9F7` `border 1px #DCEDE7` `radius 14px` padding `13px 15px` — "Gasto compartilhado" 14px/600 `#1F6B67`, "Divide igual entre os {n} membros · {valor por pessoa}" 11.5px `#3E8B85`, switch 46×27px (`#2F8F8A` ligado, `#DDD1C9` desligado, knob 21px branco).
- Botão "Registrar": 54px coral `radius 14px` 16px/700, colado no fim do sheet.
- Avisos de saldo negativo / limite excedido: mesma regra, na faixa `#F3EBE5`/âmbar.

---

## Interações e comportamento

Nada de novo além do que já existe. Resumo do que precisa continuar funcionando:
- Navegação por `NavLink` (rotas inalteradas); item ativo em coral.
- MonthSelector: chevrons deslocam o mês; clique no label volta ao mês atual; só as rotas de `MONTH_SCOPED_ROUTES` mostram o seletor.
- WalletSelector: troca de carteira; "Nova carteira" navega para `/ajustes?tab=carteiras`.
- Ações de linha (Paguei / Lançar / Recebi / Pagar) abrem os `Dialog` existentes; `disabled` quando `isPeriodLocked`.
- Mês fechado: banner âmbar + badge no header, comportamento atual.
- Busca em Lançamentos: **novo** — filtro client-side sobre a lista já carregada (`description`, `accountName`, `categoryName`).
- Lista de lançamentos da fatura: passa de accordion a lista visível com corte + "Ver todos".

**Transições:** só as que o projeto já tem (`fade-in`, `slide-up`, `scale-in` em `tailwind.config.ts`). Hover de linha e de botão: `transition-colors` 150ms. Nada de animação nova.

**Responsivo:** sidebar visível a partir de `md`; abaixo disso, tab bar + tela de menu (como hoje). A tabela de Lançamentos e a de Projeção viram card-list abaixo de `md` — não faça scroll horizontal.

## Estado
Nenhum estado novo de domínio. Apenas UI local:
- `search: string` em Lançamentos.
- `kindToggle: 'expense' | 'income'` em Lançamentos (se adotar o segmented em vez de rotas separadas).
- `expandedInvoice` continua, mas só para o "Ver todos" da fatura.

Todo o resto vem de `FinanceContext` como hoje.

## Assets
- `newlogo.svg` — mascote Carolina, já em `public/`. Sempre em tile coral (`#EF6A52`) com padding interno: 36px/`radius 11px` na sidebar, 60px/`radius 18px` no login.
- Ícones: `lucide-react`, já no projeto. O protótipo usa Material Symbols apenas porque é HTML solto — **use lucide na implementação**. Mapeamento: `space_dashboard`→`LayoutDashboard`, `receipt_long`→`ArrowDownCircle`, `autorenew`→`Repeat`, `credit_card`→`CreditCard`, `savings`→`PiggyBank`, `show_chart`→`TrendingUp`, `bar_chart`→`BarChart3`, `balance`→`Scale`, `settings`→`Settings`, `send`→`Send`, `check_circle`→`CheckCircle2`, `group`→`Users`, `search`→`Search`, `add_circle`→`PlusCircle`, `edit`→`Pencil`, `info`→`Info`.
- Fontes: Bricolage Grotesque + Hanken Grotesk (Google Fonts).

## Design tokens (resumo)

**Cores**
```
Tinta / shell    #221A17  #31241F  #362A25  #3B2D27  #4A3A33  #33262F
Sobre o escuro   #FAF6F2  #E4D8D1  #BCA79C  #9C8A80  #6E5C54
Fundo            #FAF6F2  #FDFAF8  #F3EBE5  #F1E8E1  #F4EDE7
Bordas           #EAE1DA  #E2D7CF  #F4EDE7  #DDD1C9
Texto            #221A17  #5C4C45  #7E6E66  #A9968C (só placeholder)
Coral            #EF6A52  #D95439  #D24E36  #C8452F  #FBE9E4  #FDF2EE
Teal             #2F8F8A  #25736F  #1F6B67  #3E8B85  #E7F2F1  #F4F9F7  #DCEDE7
Verde            #2A8F63  #1F7A52  #E8F5EE  #7FD3A8
Âmbar / alerta   #E08A3C  #8A6A57  #B35A3A  #F2C98A  #F0C9B8
Negativo escuro  #FF9C82  #FFB39F
Neutro de barra  #C6B4AA
```

**Espaçamento** — 2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 24 / 26 / 32 / 40 / 56 px. Padding de card `18px 22px`; gap de grid 14-16px; gap de coluna interna 10-14px.

**Raios** — 9px (tiles de ícone, botões pequenos) · 10-11px (botões, inputs de barra) · 12-13px (faixas de destaque, CTA da sidebar) · 14-15px (inputs e cards mobile) · 16px (cards de stat) · 18px (cards de conteúdo) · 28px (topo do bottom sheet) · 38px (moldura do celular) · 99/999px (pills e tracks).

**Sombras** — `0 30px 60px -20px rgba(60,38,30,.28)` só nas molduras de apresentação. Na aplicação: **sem sombra**; separação por borda `1px #EAE1DA`. Mantém `--shadow-card` apenas para popovers/dialogs.

**Alturas** — item de nav 40px · botão de linha 31px · botão padrão 38px · pill de header 38px · input desktop 40px · input mobile 52px · CTA mobile 54px · header 64px · tab bar 86px.

## Arquivos deste pacote
- `CaRe Wallet Redesign.dc.html` — protótipo completo: shell desktop com as 5 telas navegáveis (clique no menu lateral; os chevrons mudam o mês) e as 3 telas mobile em molduras de 390×844. Abre direto no navegador.
- `newlogo.svg` — mascote, cópia de `public/newlogo.svg` do repo.
- `README.md` — este documento.

## Fora do escopo (ainda não desenhado)
Relatórios, Acerto de contas, Investimentos, Gastos fixos e Receitas continuam com o layout atual. Elas herdam automaticamente os tokens novos (shell escuro, tipografia, raios, bordas) — mas o layout específico de cada uma ainda não foi redesenhado. Implemente-as reaproveitando os padrões deste documento: tiles de stat no topo, card branco com header display + linhas divididas por `#F1E8E1`, valores em `tabular-nums`, e o card escuro `#221A17` para o número dominante da tela.
