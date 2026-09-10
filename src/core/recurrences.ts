import { dayOfMonthISO, isoParts, recurrenceDueISO } from '@/lib/dates';
import type { FinanceData, OccurrenceView } from './types';

/** Ocorrências das recorrências ativas num mês, com status da baixa. */
export function recurrenceOccurrences(d: FinanceData, month: number, year: number): OccurrenceView[] {
  const mStart = dayOfMonthISO(year, month, 1);
  const mEnd = dayOfMonthISO(year, month + 1, 0);
  return d.recurrences
    .filter((r) => r.active && r.startDate <= mEnd && (!r.endDate || r.endDate >= mStart))
    .map((r) => {
      const tx = d.transactions.find((t) => t.recurrenceId === r.id && t.occMonth === month + 1 && t.occYear === year);
      const acc = r.accountId ? d.accounts.find((a) => a.id === r.accountId) : null;
      // parcelamento/empréstimo: nº da parcela = já pagas antes + meses desde o início + 1
      let installmentNo: number | null = null;
      if (r.installmentsTotal) {
        const { y: sy, m: sm } = isoParts(r.startDate);
        installmentNo = (r.installmentsDone ?? 0) + (year - sy) * 12 + (month - sm) + 1;
      }
      return {
        recurrence: r,
        dueDateISO: recurrenceDueISO(year, month, r.day),
        txId: tx?.id ?? null,
        status: tx ? (tx.status === 'cleared' ? 'paid' : 'pending') : 'none',
        amountCents: tx?.amountCents ?? r.amountCents,
        estimatedCents: r.amountCents,
        onCard: acc?.kind === 'card',
        installmentNo,
        installmentsTotal: r.installmentsTotal ?? null,
      } as OccurrenceView;
    })
    // empréstimo já quitado (ou mês antes da 1ª parcela): não gera ocorrência
    .filter((o) => o.installmentNo == null || (o.installmentNo >= 1 && o.installmentNo <= (o.installmentsTotal ?? 0)))
    .sort((a, b) => a.recurrence.day - b.recurrence.day);
}
