// Orçamento 50/30/20 adaptado à realidade da carteira:
//  - Necessidade = o que realmente é (fixos + variáveis essenciais) — não
//    limitado a 50%, porque fixo é fixo.
//  - Poupança = meta protegida de 20% da renda FIXA. Nunca encolhe.
//  - Desejo = o que sobra depois de cobrir Necessidade e proteger a
//    Poupança. É a variável de ajuste: aperta (ou zera) quando Necessidade
//    passa de 50%, em vez de tirar da meta de Poupança.
import { isInMonth } from '@/lib/dates';
import { recurrenceOccurrences } from './recurrences';
import type { FinanceData, UUID } from './types';

const AVG_MONTHS = 3;
const POUPANCA_BPS = 2000; // 20%

export type EffectiveBudgetGroup = 'necessidade' | 'desejo' | null;

export interface CategoryBudgetRow {
  categoryId: UUID;
  name: string;
  group: EffectiveBudgetGroup;
  /** tem recorrência fixa de saída ativa vinculada — grupo forçado p/ necessidade */
  fixed: boolean;
  /** valor destinado: o que o usuário salvou, ou a sugestão se nunca ajustou */
  budgetCents: number;
  /** média do gasto real nos últimos 3 meses — só uma sugestão de partida */
  suggestedCents: number;
  /** lançado nessa categoria no mês corrente (ref_month/ref_year) */
  spentCents: number;
}

export interface BudgetSummary {
  fixedIncomeCents: number;
  necessidadeBudgetCents: number;
  necessidadeSpentCents: number;
  desejoBudgetCents: number;
  desejoSpentCents: number;
  /** quanto sobraria pro Desejo depois de Necessidade + meta de Poupança (nunca negativo) */
  desejoTargetCents: number;
  /** true quando Necessidade + Poupança(20%) já passa da renda fixa — Desejo foi zerado/apertado */
  desejoSqueezed: boolean;
  poupancaTargetCents: number;
  /** soma dos Investimentos lançados no mês corrente */
  investedThisMonthCents: number;
  /** categorias de despesa sem grupo definido e sem recorrência (precisam de classificação manual) */
  unclassifiedCount: number;
  categories: CategoryBudgetRow[];
}

/** Soma das recorrências de entrada ativas no mês — a renda fixa, sem média de variável. */
export function fixedIncomeCents(d: FinanceData, month: number, year: number): number {
  return recurrenceOccurrences(d, month, year)
    .filter((o) => o.recurrence.kind === 'income')
    .reduce((s, o) => s + o.estimatedCents, 0);
}

/** Soma dos Investimentos com data dentro do mês — é o que conta como "guardado". */
export function investedCents(d: FinanceData, month: number, year: number): number {
  return d.investments
    .filter((i) => isInMonth(i.date, month, year))
    .reduce((s, i) => s + i.amountCents, 0);
}

function hasActiveExpenseRecurrence(d: FinanceData, categoryId: UUID, month: number, year: number): boolean {
  return recurrenceOccurrences(d, month, year)
    .some((o) => o.recurrence.kind === 'expense' && o.recurrence.categoryId === categoryId);
}

function avgSpentCents(d: FinanceData, categoryId: UUID, month: number, year: number): number {
  let sum = 0; let count = 0;
  for (let k = 1; k <= AVG_MONTHS; k += 1) {
    const dt = new Date(year, month - k, 1);
    const total = d.transactions
      .filter((t) => t.kind === 'expense' && t.status === 'cleared' && t.categoryId === categoryId
        && t.refMonth === dt.getMonth() + 1 && t.refYear === dt.getFullYear())
      .reduce((s, t) => s + t.amountCents, 0);
    if (total > 0) { sum += total; count += 1; }
  }
  return count > 0 ? Math.round(sum / count) : 0;
}

function spentThisMonth(d: FinanceData, categoryId: UUID, month: number, year: number): number {
  return d.transactions
    .filter((t) => t.kind === 'expense' && t.categoryId === categoryId && t.refMonth === month + 1 && t.refYear === year)
    .reduce((s, t) => s + t.amountCents, 0);
}

export function computeBudget(d: FinanceData, month: number, year: number): BudgetSummary {
  const income = fixedIncomeCents(d, month, year);
  const poupancaTargetCents = Math.round(income * (POUPANCA_BPS / 10000));
  const invested = investedCents(d, month, year);

  const expenseCategories = d.categories.filter((c) => c.kind === 'expense' && !c.archived);
  const budgetByCategory = new Map(d.categoryBudgets.map((b) => [b.categoryId, b.amountCents]));

  let unclassifiedCount = 0;
  const categories: CategoryBudgetRow[] = expenseCategories.map((c) => {
    const fixed = hasActiveExpenseRecurrence(d, c.id, month, year);
    const group: EffectiveBudgetGroup = fixed ? 'necessidade' : (c.budgetGroup ?? null);
    if (!fixed && group == null) unclassifiedCount += 1;
    const suggestedCents = avgSpentCents(d, c.id, month, year);
    const budgetCents = budgetByCategory.get(c.id) ?? suggestedCents;
    return {
      categoryId: c.id, name: c.name, group, fixed, budgetCents, suggestedCents,
      spentCents: spentThisMonth(d, c.id, month, year),
    };
  });

  const necessidadeBudgetCents = categories.filter((c) => c.group === 'necessidade').reduce((s, c) => s + c.budgetCents, 0);
  const necessidadeSpentCents = categories.filter((c) => c.group === 'necessidade').reduce((s, c) => s + c.spentCents, 0);
  const desejoBudgetCents = categories.filter((c) => c.group === 'desejo').reduce((s, c) => s + c.budgetCents, 0);
  const desejoSpentCents = categories.filter((c) => c.group === 'desejo').reduce((s, c) => s + c.spentCents, 0);

  const desejoRaw = income - necessidadeBudgetCents - poupancaTargetCents;

  return {
    fixedIncomeCents: income,
    necessidadeBudgetCents,
    necessidadeSpentCents,
    desejoBudgetCents,
    desejoSpentCents,
    desejoTargetCents: Math.max(0, desejoRaw),
    desejoSqueezed: desejoRaw < 0,
    poupancaTargetCents,
    investedThisMonthCents: invested,
    unclassifiedCount,
    categories,
  };
}
