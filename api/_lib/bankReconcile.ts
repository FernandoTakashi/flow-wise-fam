// Open Finance — conciliação depois da importação:
//  1) fixos: liga sozinho o lançamento do banco à ocorrência do mês quando a
//     descrição bate com a regra aprendida (recurrences.match_text, gravada
//     na primeira baixa manual daquele fixo);
//  2) faturas: o pagamento importado no cartão marca a fatura como paga.
import type { SupabaseClient } from '@supabase/supabase-js';
import { recurrenceDueISO } from './shared.js';

/** Descrição comparável: sem acento, sem números/pontuação, maiúscula, espaços únicos. */
export function normalizeDesc(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Regra a partir da descrição do banco: as primeiras palavras (até ~24 letras) — estável mês a mês. */
export function matchTextFrom(desc: string): string | null {
  const words = normalizeDesc(desc).split(' ').filter((w) => w.length > 1);
  const out: string[] = [];
  for (const w of words) {
    if (out.join(' ').length >= 24) break;
    out.push(w);
  }
  const rule = out.join(' ');
  return rule.length >= 4 ? rule : null;
}

const addDaysISO = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

interface RecRow {
  id: string; kind: string; account_id: string | null; category_id: string | null; day: number;
  start_date: string; end_date: string | null; amount_cents: number; shared: boolean; match_text: string | null;
}
interface TxRow { id: string; account_id: string; kind: string; date: string; description: string; category_id: string | null }

/**
 * Liga lançamentos importados a fixos com regra aprendida, nos meses desde o
 * corte até o mês corrente. Só liga quando a descrição contém a regra e a data
 * está perto do vencimento — sem regra, quem decide é o usuário (baixa manual).
 */
export async function autoLinkRecurrences(db: SupabaseClient, walletId: string, todayISO: string): Promise<number> {
  const [recs, cut] = await Promise.all([
    db.from('recurrences').select('id, kind, account_id, category_id, day, start_date, end_date, amount_cents, shared, match_text')
      .eq('wallet_id', walletId).eq('active', true).not('match_text', 'is', null),
    db.from('bank_accounts').select('account_id, import_from')
      .eq('wallet_id', walletId).not('account_id', 'is', null).not('import_from', 'is', null),
  ]);
  if (recs.error) throw recs.error;
  if (cut.error) throw cut.error;
  const cutoffByAccount = new Map((cut.data ?? []).map((c) => [c.account_id as string, c.import_from as string]));
  if (cutoffByAccount.size === 0 || (recs.data ?? []).length === 0) return 0;

  const earliest = [...cutoffByAccount.values()].sort()[0];
  const [txs, linked] = await Promise.all([
    db.from('transactions').select('id, account_id, kind, date, description, category_id')
      .eq('wallet_id', walletId).eq('source', 'import').is('recurrence_id', null).gte('date', earliest),
    db.from('transactions').select('recurrence_id, occ_month, occ_year')
      .eq('wallet_id', walletId).not('recurrence_id', 'is', null).gte('date', addDaysISO(earliest, -40)),
  ]);
  if (txs.error) throw txs.error;
  if (linked.error) throw linked.error;
  const done = new Set((linked.data ?? []).map((l) => `${l.recurrence_id}:${l.occ_year}-${l.occ_month}`));
  const free = (txs.data ?? []) as TxRow[];
  const used = new Set<string>();

  let count = 0;
  const [ty, tm] = todayISO.split('-').map(Number);
  for (const r of (recs.data ?? []) as RecRow[]) {
    const accounts = r.account_id ? [r.account_id] : [...cutoffByAccount.keys()];
    for (const acc of accounts) {
      const since = cutoffByAccount.get(acc);
      if (!since) continue;
      const [sy, sm] = since.split('-').map(Number);
      for (let y = sy, m = sm; y < ty || (y === ty && m <= tm); m === 12 ? (y += 1, m = 1) : (m += 1)) {
        if (done.has(`${r.id}:${y}-${m}`)) continue;
        const dueISO = recurrenceDueISO(y, m - 1, r.day);
        if (dueISO < r.start_date || (r.end_date && dueISO > r.end_date)) continue;
        const from = addDaysISO(dueISO, -15);
        const to = addDaysISO(dueISO, 15);
        const pick = free
          .filter((t) => !used.has(t.id) && t.account_id === acc && t.kind === r.kind && t.date >= from && t.date <= to
            && t.date >= since && normalizeDesc(t.description).includes(r.match_text!))
          .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(dueISO)) - Math.abs(Date.parse(b.date) - Date.parse(dueISO)))[0];
        if (!pick) continue;
        const upd = await db.from('transactions').update({
          recurrence_id: r.id, occ_month: m, occ_year: y,
          shared: r.kind === 'expense' && r.shared,
          ...(pick.category_id ? {} : { category_id: r.category_id }),
        }).eq('id', pick.id);
        if (upd.error) throw upd.error;
        used.add(pick.id);
        done.add(`${r.id}:${y}-${m}`);
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Pagamento importado no cartão (transferência que credita o cartão) quita a
 * fatura em aberto cujo período cobre a data do pagamento: fechada antes dele
 * e vencendo até 10 dias depois. Marca paga e liga o pagamento à fatura.
 */
export async function markPaidInvoices(db: SupabaseClient, walletId: string): Promise<number> {
  const cards = await db.from('bank_accounts').select('account_id')
    .eq('wallet_id', walletId).eq('type', 'CREDIT').not('account_id', 'is', null).not('import_from', 'is', null);
  if (cards.error) throw cards.error;
  let count = 0;
  for (const c of cards.data ?? []) {
    const cardId = c.account_id as string;
    const [pays, invs] = await Promise.all([
      db.from('transactions').select('id, date')
        .eq('account_id', cardId).eq('source', 'import').eq('kind', 'transfer').eq('transfer_credit', true)
        .is('card_invoice_id', null).eq('status', 'cleared').order('date'),
      db.from('card_invoices').select('id, closing_date, due_date, status')
        .eq('account_id', cardId).eq('status', 'open').order('closing_date'),
    ]);
    if (pays.error) throw pays.error;
    if (invs.error) throw invs.error;
    const open = [...(invs.data ?? [])];
    for (const p of pays.data ?? []) {
      // a fatura mais recente já fechada na data do pagamento
      const inv = open
        .filter((i) => (i.closing_date as string) <= p.date && p.date <= addDaysISO(i.due_date as string, 10))
        .sort((a, b) => ((a.closing_date as string) < (b.closing_date as string) ? 1 : -1))[0];
      if (!inv) continue;
      const a = await db.from('transactions').update({ card_invoice_id: inv.id }).eq('id', p.id);
      if (a.error) throw a.error;
      const b = await db.from('card_invoices').update({ status: 'paid', paid_transaction_id: p.id }).eq('id', inv.id);
      if (b.error) throw b.error;
      open.splice(open.indexOf(inv), 1);
      count += 1;
    }
  }
  return count;
}
