import type { Account, CardInvoice, Transaction } from '@/types';
import type { FinanceData } from './types';

/** Saldo de uma conta = saldo inicial + Σ movimentos `cleared` até `uptoISO`. */
export function accountBalance(acc: Account, txs: Transaction[], uptoISO: string, excludeId?: string): number {
  let total = acc.openingBalanceCents;
  for (const t of txs) {
    if (t.id === excludeId || t.accountId !== acc.id || t.status !== 'cleared' || t.date > uptoISO) continue;
    if (t.kind === 'income') total += t.amountCents;
    else if (t.kind === 'expense') total -= t.amountCents;
    else total += acc.kind === 'card' ? t.amountCents : -t.amountCents;
  }
  return total;
}

/** Comprometido de um cartão = Σ despesas nas faturas em aberto. */
export function cardCommitted(cardId: string, txs: Transaction[], invs: CardInvoice[], excludeId?: string): number {
  const openIds = new Set(invs.filter((i) => i.accountId === cardId && i.status !== 'paid').map((i) => i.id));
  return txs
    .filter((t) => t.id !== excludeId && t.accountId === cardId && t.kind === 'expense'
      && t.cardInvoiceId && openIds.has(t.cardInvoiceId))
    .reduce((s, t) => s + t.amountCents, 0);
}

export const spendingAccounts = (d: FinanceData): Account[] =>
  d.accounts.filter((a) => a.kind !== 'card' && !a.archived);

export const cards = (d: FinanceData): Account[] =>
  d.accounts.filter((a) => a.kind === 'card' && !a.archived);

export function accountBalanceCents(d: FinanceData, accountId: string, uptoISO?: string): number {
  const acc = d.accounts.find((a) => a.id === accountId);
  return acc ? accountBalance(acc, d.transactions, uptoISO ?? d.today) : 0;
}

export function cashBalanceCents(d: FinanceData, uptoISO?: string): number {
  return spendingAccounts(d).reduce((s, a) => s + accountBalance(a, d.transactions, uptoISO ?? d.today), 0);
}

export function cardCommittedCents(d: FinanceData, cardId: string): number {
  return cardCommitted(cardId, d.transactions, d.invoices);
}

export function cardAvailableCents(d: FinanceData, cardId: string): number {
  const card = d.accounts.find((a) => a.id === cardId);
  return (card?.creditLimitCents ?? 0) - cardCommittedCents(d, cardId);
}
