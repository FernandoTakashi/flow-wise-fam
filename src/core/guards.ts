import type { PeriodLock } from '@/types';
import { accountBalanceCents, cardCommittedCents } from './balances';
import type { FinanceData } from './types';

export function isPeriodLocked(periodLocks: PeriodLock[], month: number, year: number): boolean {
  return periodLocks.some((l) => l.refMonth === month + 1 && l.refYear === year);
}

/** Uma saída de `amountCents` deixaria a conta de dinheiro negativa? */
export function wouldOverdraw(d: FinanceData, accountId: string, amountCents: number): boolean {
  const acc = d.accounts.find((a) => a.id === accountId);
  if (!acc || acc.kind === 'card') return false;
  return accountBalanceCents(d, accountId) - amountCents < 0;
}

/** Uma compra de `amountCents` ultrapassaria o limite do cartão? */
export function wouldExceedLimit(d: FinanceData, cardId: string, amountCents: number): boolean {
  const card = d.accounts.find((a) => a.id === cardId);
  if (card?.kind !== 'card' || card.creditLimitCents == null) return false;
  return cardCommittedCents(d, cardId) + amountCents > card.creditLimitCents;
}
