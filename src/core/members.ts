import type { MemberBalance, Settlement, UUID } from '@/types';
import type { FinanceData, MemberSpend } from './types';

/**
 * Gasto individual do mês (competência): despesas NÃO compartilhadas, por quem
 * pagou. As compartilhadas ficam de fora — vão para jointSpendCents.
 */
export function spendByMember(d: FinanceData, month: number, year: number): MemberSpend[] {
  const totals: Record<string, number> = {};
  for (const t of d.transactions) {
    if (t.kind !== 'expense' || t.status !== 'cleared' || t.shared) continue;
    if (t.refMonth !== month + 1 || t.refYear !== year) continue;
    if (t.memberId) totals[t.memberId] = (totals[t.memberId] ?? 0) + t.amountCents;
  }
  return d.members
    .map((m) => ({ memberId: m.userId, totalCents: totals[m.userId] ?? 0 }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** Total gasto "em conjunto" no mês (despesas marcadas como compartilhadas). */
export function jointSpendCents(d: FinanceData, month: number, year: number): number {
  return d.transactions
    .filter((t) => t.kind === 'expense' && t.status === 'cleared' && t.shared
      && t.refMonth === month + 1 && t.refYear === year)
    .reduce((s, t) => s + t.amountCents, 0);
}

/**
 * "Quem deve a quem" — SÓ despesas com divisão explícita (transaction_splits),
 * acumulado de todos os tempos. Feature de acerto de contas (hoje dormente).
 */
export function memberBalances(d: FinanceData): MemberBalance[] {
  const net: Record<UUID, number> = {};
  d.members.forEach((m) => { net[m.userId] = 0; });
  d.transactions
    .filter((t) => t.kind === 'expense' && t.status === 'cleared' && t.memberId && t.splits.length > 0)
    .forEach((t) => {
      const payer = t.memberId as UUID;
      t.splits.forEach((s) => {
        if (s.memberId === payer) return;
        net[payer] = (net[payer] ?? 0) + s.shareCents;
        net[s.memberId] = (net[s.memberId] ?? 0) - s.shareCents;
      });
    });
  return Object.entries(net).map(([memberId, netCents]) => ({ memberId, netCents }));
}

export function settlements(d: FinanceData): Settlement[] {
  const bal = memberBalances(d).map((b) => ({ ...b }));
  const debtors = bal.filter((b) => b.netCents < 0).sort((a, b) => a.netCents - b.netCents);
  const creditors = bal.filter((b) => b.netCents > 0).sort((a, b) => b.netCents - a.netCents);
  const out: Settlement[] = [];
  let i = 0; let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(-debtors[i].netCents, creditors[j].netCents);
    if (amount > 0) out.push({ fromId: debtors[i].memberId, toId: creditors[j].memberId, amountCents: amount });
    debtors[i].netCents += amount;
    creditors[j].netCents -= amount;
    if (debtors[i].netCents === 0) i += 1;
    if (creditors[j].netCents === 0) j += 1;
  }
  return out;
}
