// Retrato compacto da carteira para o "cérebro" do bot (Haiku). Só leitura.
// Espelha os cálculos do FinanceContext (saldo, resumo do mês, ocorrências).
import { admin } from './supabaseAdmin.js';
import { loadWalletBundle, type WalletBundle } from './finance.js';
import { dayOfMonthISO, isoParts, formatBRL } from './shared.js';

interface TxRow {
  amount_cents: number; kind: 'income' | 'expense' | 'transfer'; account_id: string;
  status: string; date: string; ref_month: number; ref_year: number;
  description: string | null; card_invoice_id: string | null; recurrence_id: string | null;
}

export interface WalletContext {
  hoje: string;
  mesLabel: string;
  contas: { id: string; nome: string; tipo: string; saldo: string }[];
  contasParaLancar: { id: string; nome: string; tipo: string }[];
  categorias: { id: string; nome: string; tipo: string }[];
  resumoMes: {
    entradasRealizadas: string; saidasRealizadas: string; resultado: string;
    aPagar: string; aReceber: string;
  };
  fixosAPagar: { recurrenceId: string; descricao: string; valor: string; dia: number; parcela: string | null }[];
  fixosAReceber: { recurrenceId: string; descricao: string; valor: string; dia: number }[];
  faturas: { cartao: string; aberto: string; status: string }[];
  ultimosLancamentos: { data: string; descricao: string; valor: string; conta: string }[];
}

const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export async function buildWalletContext(walletId: string, todayISO: string): Promise<WalletContext> {
  const bundle = await loadWalletBundle(walletId);
  const { data: txData } = await admin().from('transactions')
    .select('amount_cents, kind, account_id, status, date, ref_month, ref_year, description, card_invoice_id, recurrence_id')
    .eq('wallet_id', walletId);
  const txs = (txData ?? []) as TxRow[];

  const { y, m } = isoParts(todayISO);            // m: 0-11
  const refMonth = m + 1;
  const mStart = dayOfMonthISO(y, m, 1);
  const mEnd = dayOfMonthISO(y, m + 1, 0);
  const cardIds = new Set(bundle.accounts.filter((a) => a.kind === 'card').map((a) => a.id));

  // saldo por conta de dinheiro (opening + Σ cleared até hoje)
  const spending = bundle.accounts.filter((a) => a.kind !== 'card' && !a.archived);
  const contas = spending.map((a) => {
    let bal = a.opening_balance_cents ?? 0;
    for (const t of txs) {
      if (t.account_id !== a.id || t.status !== 'cleared' || t.date > todayISO) continue;
      if (t.kind === 'income') bal += t.amount_cents;
      else if (t.kind === 'expense') bal -= t.amount_cents;
      else bal -= t.amount_cents; // transfer de conta de dinheiro = saída
    }
    return { id: a.id, nome: a.name, tipo: a.kind, saldo: formatBRL(bal) };
  });

  // resumo do mês por competência
  const refTx = txs.filter((t) => t.ref_month === refMonth && t.ref_year === y);
  const entradas = refTx.filter((t) => t.kind === 'income' && t.status === 'cleared').reduce((s, t) => s + t.amount_cents, 0);
  const saidas = refTx.filter((t) => t.kind === 'expense' && t.status === 'cleared').reduce((s, t) => s + t.amount_cents, 0);

  // ocorrências de fixos deste mês
  const occExists = (recId: string) => txs.some(
    (t) => t.recurrence_id === recId && t.status === 'cleared' && isInMonth(t.date, m, y),
  );
  const informed = (recId: string) => txs.find(
    (t) => t.recurrence_id === recId && t.status === 'pending' && isInMonth(t.date, m, y),
  )?.amount_cents ?? null;

  const inWindow = (r: WalletBundle['recurrences'][number]) => {
    if (!r.active || r.start_date > mEnd || (r.end_date && r.end_date < mStart)) return false;
    if (r.installments_total) {
      const { y: sy, m: sm } = isoParts(r.start_date);
      const no = (r.installments_done ?? 0) + (y - sy) * 12 + (m - sm) + 1;
      if (no < 1 || no > r.installments_total) return false;
    }
    return true;
  };

  const fixosAPagar: WalletContext['fixosAPagar'] = [];
  const fixosAReceber: WalletContext['fixosAReceber'] = [];
  for (const r of bundle.recurrences) {
    if (!inWindow(r) || occExists(r.id)) continue;
    const valor = informed(r.id) ?? r.amount_cents;
    if (r.kind === 'expense') {
      let parcela: string | null = null;
      if (r.installments_total) {
        const { y: sy, m: sm } = isoParts(r.start_date);
        const no = (r.installments_done ?? 0) + (y - sy) * 12 + (m - sm) + 1;
        parcela = `${no}/${r.installments_total}`;
      }
      fixosAPagar.push({ recurrenceId: r.id, descricao: r.description, valor: formatBRL(valor), dia: r.day, parcela });
    } else {
      fixosAReceber.push({ recurrenceId: r.id, descricao: r.description, valor: formatBRL(valor), dia: r.day });
    }
  }

  // faturas abertas do mês
  const faturas: WalletContext['faturas'] = [];
  for (const card of bundle.accounts.filter((a) => a.kind === 'card' && !a.archived)) {
    const inv = bundle.invoices.find((i) => i.account_id === card.id && i.ref_month === refMonth && i.ref_year === y);
    const posted = inv ? txs.filter((t) => t.card_invoice_id === inv.id && t.kind === 'expense').reduce((s, t) => s + t.amount_cents, 0) : 0;
    if (posted > 0 || (inv && inv.status !== 'paid')) {
      faturas.push({ cartao: card.name, aberto: formatBRL(posted), status: inv?.status ?? 'sem fatura' });
    }
  }

  const aPagarCents = fixosAPagar.reduce((s, f) => s + unBRL(f.valor), 0)
    + faturas.filter((f) => f.status !== 'paid').reduce((s, f) => s + unBRL(f.aberto), 0);
  const aReceberCents = fixosAReceber.reduce((s, f) => s + unBRL(f.valor), 0);

  const ultimos = [...txs]
    .filter((t) => t.status === 'cleared')
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8)
    .map((t) => ({
      data: t.date,
      descricao: t.description || '—',
      valor: (t.kind === 'income' ? '+' : t.kind === 'expense' ? '-' : '') + formatBRL(t.amount_cents),
      conta: bundle.accounts.find((a) => a.id === t.account_id)?.name ?? '—',
    }));

  return {
    hoje: todayISO,
    mesLabel: `${MES[m]} de ${y}`,
    contas,
    contasParaLancar: bundle.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, nome: a.name, tipo: a.kind })),
    categorias: bundle.categories.map((c) => ({ id: c.id, nome: c.name, tipo: c.kind })),
    resumoMes: {
      entradasRealizadas: formatBRL(entradas),
      saidasRealizadas: formatBRL(saidas),
      resultado: formatBRL(entradas - saidas),
      aPagar: formatBRL(aPagarCents),
      aReceber: formatBRL(aReceberCents),
    },
    fixosAPagar,
    fixosAReceber,
    faturas,
    ultimosLancamentos: ultimos,
  };
}

function isInMonth(iso: string, month: number, year: number): boolean {
  const { y, m } = isoParts(iso);
  return m === month && y === year;
}
// "R$ 1.234,56" -> 123456
function unBRL(s: string): number {
  const n = parseFloat(s.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
