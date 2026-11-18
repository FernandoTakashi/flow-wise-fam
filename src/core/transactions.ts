import { isInMonth, isoParts } from '@/lib/dates';
import type { Account, Transaction } from '@/types';

/** Transações cuja DATA (regime de caixa) cai no mês. */
export const monthTxByDate = (txs: Transaction[], month: number, year: number): Transaction[] =>
  txs.filter((t) => isInMonth(t.date, month, year));

/** Transações cuja COMPETÊNCIA (ref) cai no mês. */
export const monthTxByRef = (txs: Transaction[], month: number, year: number): Transaction[] =>
  txs.filter((t) => t.refMonth === month + 1 && t.refYear === year);

/**
 * Mês em que o lançamento aparece na lista de Lançamentos.
 *  - compra no cartão (à vista ou 1ª parcela): mês da COMPRA (data) — é quando
 *    você gastou, não quando a fatura vence;
 *  - parcela 2..n do cartão: mês da FATURA em que ela cai (competência);
 *  - o resto (conta, transferência, pagamento de fatura): competência, como sempre.
 * Fatura, orçamento e relatórios continuam pela competência.
 */
export function listMonthOf(t: Transaction, accountKind: string | undefined): { month: number; year: number } {
  const laterInstallment = (t.installmentOf ?? 0) > 1 && (t.installmentNo ?? 1) > 1;
  if (accountKind === 'card' && t.kind !== 'transfer' && !laterInstallment) {
    const { y, m } = isoParts(t.date);
    return { month: m, year: y };
  }
  return { month: t.refMonth - 1, year: t.refYear };
}

/** Lançamentos que aparecem na lista do mês (0-11), pela regra de `listMonthOf`. */
export function monthTxForList(
  txs: Transaction[], accounts: Pick<Account, 'id' | 'kind'>[], month: number, year: number,
): Transaction[] {
  const kindOf = new Map(accounts.map((a) => [a.id, a.kind]));
  return txs.filter((t) => {
    const lm = listMonthOf(t, kindOf.get(t.accountId));
    return lm.month === month && lm.year === year;
  });
}
