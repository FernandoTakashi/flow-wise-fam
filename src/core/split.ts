// "Dividir" — regras puras de saldo/divisão de despesa em grupo.
// Deliberadamente sem nenhum tipo/importação de `@/core/types` (FinanceData):
// esse domínio não tem relação nenhuma com carteira, conta ou categoria.
import { equalSplitCents } from '@/lib/money';

export interface SplitExpenseInput {
  id: string;
  paidBy: string;      // split_members.id de quem pagou
  amountCents: number;
}
export interface SplitShareInput {
  expenseId: string;
  memberId: string;
  shareCents: number;
}
export interface SplitPaymentInput {
  fromMember: string;
  toMember: string;
  amountCents: number;
}
export interface SplitBalance {
  memberId: string;
  /** positivo = os outros devem pra essa pessoa; negativo = ela deve. */
  netCents: number;
}
export interface SplitSettlement {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

/**
 * Saldo de cada membro:
 *   + o que pagou de despesas
 *   − a parte que cabe a ele nas despesas
 *   + acertos que ele fez (reduz o quanto deve)
 *   − acertos que ele recebeu (reduz o quanto lhe é devido)
 */
export function computeSplitBalances(
  memberIds: string[],
  expenses: SplitExpenseInput[],
  shares: SplitShareInput[],
  payments: SplitPaymentInput[],
): SplitBalance[] {
  const net: Record<string, number> = {};
  memberIds.forEach((id) => { net[id] = 0; });

  for (const e of expenses) net[e.paidBy] = (net[e.paidBy] ?? 0) + e.amountCents;
  for (const s of shares) net[s.memberId] = (net[s.memberId] ?? 0) - s.shareCents;
  for (const p of payments) {
    net[p.fromMember] = (net[p.fromMember] ?? 0) + p.amountCents;
    net[p.toMember] = (net[p.toMember] ?? 0) - p.amountCents;
  }

  return Object.entries(net).map(([memberId, netCents]) => ({ memberId, netCents }));
}

/**
 * Simplifica os saldos pro menor número de transferências possível —
 * algoritmo guloso: maior devedor paga o maior credor, repete.
 * Espelha settlements() de src/core/members.ts (mesma ideia, fonte diferente).
 */
export function simplifySplitDebts(balances: SplitBalance[]): SplitSettlement[] {
  const bal = balances.map((b) => ({ ...b })).filter((b) => b.netCents !== 0);
  const debtors = bal.filter((b) => b.netCents < 0).sort((a, b) => a.netCents - b.netCents);
  const creditors = bal.filter((b) => b.netCents > 0).sort((a, b) => b.netCents - a.netCents);
  const out: SplitSettlement[] = [];
  let i = 0; let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(-debtors[i].netCents, creditors[j].netCents);
    if (amount > 0) out.push({ fromMemberId: debtors[i].memberId, toMemberId: creditors[j].memberId, amountCents: amount });
    debtors[i].netCents += amount;
    creditors[j].netCents -= amount;
    if (debtors[i].netCents === 0) i += 1;
    if (creditors[j].netCents === 0) j += 1;
  }
  return out;
}

/** Divide `amountCents` igualmente entre `memberIds` — resto distribuído 1 centavo por vez, soma sempre bate. */
export function equalSplitShares(amountCents: number, memberIds: string[]): Record<string, number> {
  if (memberIds.length === 0) return {};
  const parts = equalSplitCents(amountCents, memberIds.length);
  const out: Record<string, number> = {};
  memberIds.forEach((id, i) => { out[id] = parts[i]; });
  return out;
}

/** A soma dos valores exatos digitados precisa bater com o total da despesa. */
export function exactSharesMatchTotal(amountCents: number, shareCents: Record<string, number>): boolean {
  const sum = Object.values(shareCents).reduce((s, c) => s + c, 0);
  return sum === amountCents;
}
