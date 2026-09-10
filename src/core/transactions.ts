import { isInMonth } from '@/lib/dates';
import type { Transaction } from '@/types';

/** Transações cuja DATA (regime de caixa) cai no mês. */
export const monthTxByDate = (txs: Transaction[], month: number, year: number): Transaction[] =>
  txs.filter((t) => isInMonth(t.date, month, year));

/** Transações cuja COMPETÊNCIA (ref) cai no mês. */
export const monthTxByRef = (txs: Transaction[], month: number, year: number): Transaction[] =>
  txs.filter((t) => t.refMonth === month + 1 && t.refYear === year);
