// Retrato compacto de um grupo do "Dividir" pro Haiku — só o que existe
// nesse domínio (membros, despesas, saldo). Nunca importa nada de finance.ts
// ou context.ts (carteira): o modo grupo não pode nem saber que isso existe.
import { loadSplitGroup, computeBalances, simplifyBalances, type SplitGroupBundle } from './splitFinance.js';
import { formatBRL } from './shared.js';

export interface SplitGroupContext {
  grupo: string;
  membros: { id: string; nome: string }[];
  saldo: { nome: string; valor: string }[];
  simplificado: { de: string; para: string; valor: string }[];
  ultimasDespesas: { descricao: string; valor: string; pagouQuem: string; data: string }[];
}

export async function buildSplitGroupContext(groupId: string): Promise<{ ctx: SplitGroupContext; bundle: SplitGroupBundle }> {
  const bundle = await loadSplitGroup(groupId);
  if (!bundle) throw new Error('Grupo não encontrado.');

  const nameOf = (memberId: string) => bundle.members.find((m) => m.id === memberId)?.display_name ?? '—';
  const balances = computeBalances(bundle);
  const settlements = simplifyBalances(balances);

  const ctx: SplitGroupContext = {
    grupo: bundle.group.name,
    membros: bundle.members.filter((m) => !m.left_at).map((m) => ({ id: m.id, nome: m.display_name })),
    saldo: balances.filter((b) => b.netCents !== 0).map((b) => ({ nome: nameOf(b.memberId), valor: formatBRL(b.netCents) })),
    simplificado: settlements.map((s) => ({ de: nameOf(s.fromMemberId), para: nameOf(s.toMemberId), valor: formatBRL(s.amountCents) })),
    ultimasDespesas: [...bundle.expenses].slice(0, 8).map((e) => ({
      descricao: e.description, valor: formatBRL(e.amount_cents), pagouQuem: nameOf(e.paid_by), data: e.date,
    })),
  };

  return { ctx, bundle };
}
