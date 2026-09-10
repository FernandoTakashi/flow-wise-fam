import { dayOfMonthISO, recurrenceDueISO, resolveInvoiceRef } from '@/lib/dates';
import type { Recurrence } from '@/types';
import type { FinanceData, InvoiceRow, InvoiceView } from './types';

/** Fixos de cartão cuja competência cai nesta fatura e que ainda não viraram lançamento. */
export function projectedCardFixos(
  d: FinanceData, cardId: string, month: number, year: number,
): { recurrence: Recurrence; dueISO: string; amountCents: number }[] {
  const card = d.accounts.find((a) => a.id === cardId);
  if (!card) return [];
  const closing = card.closingDay ?? 1;
  const out: { recurrence: Recurrence; dueISO: string; amountCents: number }[] = [];
  for (const offset of [0, -1]) {
    const obl = new Date(year, month + offset, 1);
    const oM = obl.getMonth(); const oY = obl.getFullYear();
    const mStart = dayOfMonthISO(oY, oM, 1);
    const mEnd = dayOfMonthISO(oY, oM + 1, 0);
    for (const r of d.recurrences) {
      if (r.accountId !== cardId || r.kind !== 'expense' || !r.active) continue;
      if (r.startDate > mEnd || (r.endDate && r.endDate < mStart)) continue;
      const dueISO = recurrenceDueISO(oY, oM, r.day);
      const inv = resolveInvoiceRef(dueISO, closing);
      if (inv.refMonth !== month + 1 || inv.refYear !== year) continue;
      // já virou lançamento? testa pela âncora da OCORRÊNCIA (oM/oY), não pela
      // competência da fatura — a baixa pode ter caído em outra fatura.
      const already = d.transactions.some((t) => t.recurrenceId === r.id && t.occMonth === oM + 1 && t.occYear === oY);
      if (already) continue;
      out.push({ recurrence: r, dueISO, amountCents: r.amountCents });
    }
  }
  return out;
}

export function computeInvoiceView(d: FinanceData, cardId: string, month: number, year: number): InvoiceView {
  const refMonth = month + 1;
  const invoice = d.invoices.find((i) => i.accountId === cardId && i.refMonth === refMonth && i.refYear === year) ?? null;
  const posted = invoice
    ? d.transactions.filter((t) => t.cardInvoiceId === invoice.id && t.kind === 'expense')
    : [];
  const postedCents = posted.reduce((s, t) => s + t.amountCents, 0);
  const projected = projectedCardFixos(d, cardId, month, year);
  const rows: InvoiceRow[] = [
    ...posted.map((t) => ({
      key: t.id, description: t.description || '—', dateISO: t.date, amountCents: t.amountCents,
      type: (t.recurrenceId ? 'fixo' : 'variavel') as InvoiceRow['type'], projected: false,
    })),
    ...projected.map((p) => ({
      key: `proj:${p.recurrence.id}`, description: p.recurrence.description, dateISO: p.dueISO,
      amountCents: p.amountCents, type: 'previsto' as const, projected: true,
    })),
  ].sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
  return {
    invoice,
    status: invoice?.status ?? 'open',
    postedCents,
    projectedCents: postedCents + projected.reduce((s, p) => s + p.amountCents, 0),
    rows,
  };
}
