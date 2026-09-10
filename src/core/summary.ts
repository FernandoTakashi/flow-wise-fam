import { cards, cashBalanceCents } from './balances';
import { computeInvoiceView } from './invoices';
import { recurrenceOccurrences } from './recurrences';
import type { FinanceData, MonthSummary } from './types';

/** Resumo do mês: realizado por competência + pendências (fixos, faturas, previstos). */
export function monthSummary(d: FinanceData, month: number, year: number): MonthSummary {
  const cardIds = new Set(cards(d).map((c) => c.id));
  const refTx = d.transactions.filter((t) => t.refMonth === month + 1 && t.refYear === year);

  const incomeRealizedCents = refTx
    .filter((t) => t.kind === 'income' && t.status === 'cleared').reduce((s, t) => s + t.amountCents, 0);
  const directExpenseRealized = refTx
    .filter((t) => t.kind === 'expense' && t.status === 'cleared' && !cardIds.has(t.accountId))
    .reduce((s, t) => s + t.amountCents, 0);

  let cardBillCents = 0;
  let cardOpenCents = 0;
  let projectedCardCents = 0;
  for (const card of cards(d)) {
    const v = computeInvoiceView(d, card.id, month, year);
    cardBillCents += v.postedCents;
    if (v.status !== 'paid') cardOpenCents += v.postedCents;
    projectedCardCents += v.projectedCents - v.postedCents;
  }
  const cardPaidCents = cardBillCents - cardOpenCents;

  const occ = recurrenceOccurrences(d, month, year).filter((o) => o.status !== 'paid');
  const pendingIncomeCents = occ.filter((o) => o.recurrence.kind === 'income').reduce((s, o) => s + o.amountCents, 0);
  const pendingNonCardExpense = occ
    .filter((o) => o.recurrence.kind === 'expense' && !o.onCard)
    .reduce((s, o) => s + o.amountCents, 0);
  const pendingBoletos = refTx
    .filter((t) => t.kind === 'expense' && t.status === 'pending' && !cardIds.has(t.accountId) && !t.recurrenceId)
    .reduce((s, t) => s + t.amountCents, 0);

  const cashBalance = cashBalanceCents(d);
  const pendingExpenseCents = pendingNonCardExpense + pendingBoletos + cardOpenCents + projectedCardCents;

  return {
    incomeRealizedCents,
    expenseRealizedCents: directExpenseRealized + cardPaidCents,
    pendingIncomeCents,
    pendingExpenseCents,
    cardBillCents,
    cardOpenCents,
    cashBalanceCents: cashBalance,
    projectedBalanceCents: cashBalance + pendingIncomeCents - pendingExpenseCents,
  };
}
