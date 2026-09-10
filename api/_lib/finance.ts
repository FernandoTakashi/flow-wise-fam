// Operações de escrita no domínio financeiro a partir do backend (bot / cron).
// Espelha a lógica de FinanceContext.tsx (refFor / ensureInvoice / markRecurrence).
import { randomUUID } from 'node:crypto';
import { admin } from './supabaseAdmin.js';
import {
  addMonthsISO, invoiceDates, isoParts, recurrenceDueISO, resolveInvoiceRef, splitInstallments,
} from './shared.js';

export interface AccountRow {
  id: string; wallet_id: string; name: string; kind: 'cash' | 'checking' | 'card';
  closing_day: number | null; due_day: number | null; archived: boolean;
  opening_balance_cents: number | null;
}
export interface RecurrenceRow {
  id: string; wallet_id: string; description: string; kind: 'income' | 'expense';
  amount_cents: number; category_id: string | null; account_id: string | null;
  day: number; start_date: string; end_date: string | null; active: boolean;
  autopay: boolean; shared: boolean;
  installments_total: number | null; installments_done: number | null;
}
export interface InvoiceRow {
  id: string; account_id: string; ref_month: number; ref_year: number; status: string;
}

export interface WalletBundle {
  accounts: AccountRow[];
  categories: { id: string; name: string; kind: string }[];
  recurrences: RecurrenceRow[];
  invoices: InvoiceRow[];
  memberIds: string[];
}

export async function loadWalletBundle(walletId: string): Promise<WalletBundle> {
  const db = admin();
  const [accs, cats, recs, invs, mems] = await Promise.all([
    db.from('accounts').select('id, wallet_id, name, kind, closing_day, due_day, archived, opening_balance_cents').eq('wallet_id', walletId),
    db.from('categories').select('id, name, kind').eq('wallet_id', walletId).eq('archived', false),
    db.from('recurrences').select('*').eq('wallet_id', walletId).eq('active', true),
    db.from('card_invoices').select('id, account_id, ref_month, ref_year, status').eq('wallet_id', walletId),
    db.from('wallet_members').select('user_id').eq('wallet_id', walletId),
  ]);
  for (const r of [accs, cats, recs, invs, mems]) if (r.error) throw r.error;
  return {
    accounts: (accs.data ?? []) as AccountRow[],
    categories: (cats.data ?? []) as { id: string; name: string; kind: string }[],
    recurrences: (recs.data ?? []) as RecurrenceRow[],
    invoices: (invs.data ?? []) as InvoiceRow[],
    memberIds: ((mems.data ?? []) as { user_id: string }[]).map((m) => m.user_id),
  };
}

function refFor(dateISO: string, account: Pick<AccountRow, 'kind' | 'closing_day'>): { refMonth: number; refYear: number } {
  if (account.kind === 'card') return resolveInvoiceRef(dateISO, account.closing_day ?? 1);
  const { y, m } = isoParts(dateISO);
  return { refMonth: m + 1, refYear: y };
}

async function ensureInvoice(walletId: string, card: AccountRow, dateISO: string): Promise<string> {
  const db = admin();
  const closing = card.closing_day ?? 1;
  const due = card.due_day ?? closing;
  const { refMonth, refYear } = resolveInvoiceRef(dateISO, closing);

  const found = await db.from('card_invoices').select('id')
    .eq('account_id', card.id).eq('ref_year', refYear).eq('ref_month', refMonth).maybeSingle();
  if (found.data) return found.data.id as string;

  const { closingDate, dueDate } = invoiceDates(refMonth, refYear, closing, due);
  const ins = await db.from('card_invoices').insert({
    wallet_id: walletId, account_id: card.id, ref_month: refMonth, ref_year: refYear,
    closing_date: closingDate, due_date: dueDate, status: 'open',
  }).select('id').single();

  if (ins.error) {
    if (ins.error.code === '23505') {
      const again = await db.from('card_invoices').select('id')
        .eq('account_id', card.id).eq('ref_year', refYear).eq('ref_month', refMonth).single();
      if (again.data) return again.data.id as string;
    }
    throw ins.error;
  }
  return ins.data.id as string;
}

export interface EntryInput {
  kind: 'income' | 'expense';
  description: string;
  amountCents: number;
  accountId: string | null;
  categoryId: string | null;
  dateISO: string;
  note: string | null;
  installments?: number | null;
  shared?: boolean | null;
}

/** Cria um lançamento avulso do bot (com parcelas de cartão e divisão opcionais). */
export async function insertEntry(
  bundle: WalletBundle, walletId: string, createdBy: string, entry: EntryInput, source: string,
): Promise<{ accountName: string; onCard: boolean; parts: number }> {
  const db = admin();
  const spending = bundle.accounts.filter((a) => a.kind !== 'card' && !a.archived);
  const account =
    (entry.accountId && bundle.accounts.find((a) => a.id === entry.accountId)) || spending[0];
  if (!account) throw new Error('Nenhuma conta disponível nesta carteira.');

  const onCard = account.kind === 'card';
  const n = onCard && entry.installments && entry.installments > 1 ? Math.min(entry.installments, 60) : 1;
  const parts = splitInstallments(entry.amountCents, n);
  const group = n > 1 ? randomUUID() : null;

  const isShared = entry.kind === 'expense' && entry.shared === true;
  for (let i = 0; i < n; i += 1) {
    const dISO = n > 1 ? addMonthsISO(entry.dateISO, i) : entry.dateISO;
    const invoiceId = onCard ? await ensureInvoice(walletId, account, dISO) : null;
    const ref = refFor(dISO, account);
    const { error } = await db.from('transactions').insert({
      wallet_id: walletId, account_id: account.id, kind: entry.kind, amount_cents: parts[i],
      date: dISO, ref_month: ref.refMonth, ref_year: ref.refYear, status: 'cleared',
      description: n > 1 ? `${entry.description} (${i + 1}/${n})` : entry.description,
      category_id: entry.categoryId, member_id: createdBy, created_by: createdBy,
      card_invoice_id: invoiceId, note: entry.note, source, shared: isShared,
      installment_group: group, installment_no: n > 1 ? i + 1 : null, installment_of: n > 1 ? n : null,
    });
    if (error) throw error;
  }
  return { accountName: account.name, onCard, parts: n };
}

/**
 * Marca (ou ajusta) a ocorrência de uma recorrência num mês como paga/recebida.
 * `month` é 0-11. Espelha markRecurrenceOccurrence do FinanceContext.
 */
export async function markOccurrence(
  bundle: WalletBundle, walletId: string, rec: RecurrenceRow,
  month: number, year: number, amountCents: number, memberId: string | null, source: string,
  paidOnISO?: string, shared?: boolean,
): Promise<{ created: boolean; onCard: boolean }> {
  const db = admin();

  const spending = bundle.accounts.filter((a) => a.kind !== 'card' && !a.archived);
  const account = (rec.account_id && bundle.accounts.find((a) => a.id === rec.account_id)) || spending[0];
  if (!account) throw new Error('Escolha uma forma de pagamento para esta recorrência.');
  const onCard = account.kind === 'card';

  const dueISO = recurrenceDueISO(year, month, rec.day);
  const chargeISO = paidOnISO ?? dueISO;                            // dia da baixa
  const ref = onCard ? refFor(chargeISO, account) : { refMonth: month + 1, refYear: year };
  // data-caixa = dia da baixa (não o vencimento): senão um recebimento marcado
  // antes do dia de vencimento fica com data futura e some do saldo/projeção.
  const cashDateISO = chargeISO;

  if (onCard) {
    const target = bundle.invoices.find(
      (i) => i.account_id === account.id && i.ref_month === ref.refMonth && i.ref_year === ref.refYear,
    );
    if (target && target.status !== 'open') {
      throw new Error(
        `A fatura ${String(ref.refMonth).padStart(2, '0')}/${ref.refYear} está `
        + `${target.status === 'paid' ? 'paga' : 'fechada'}. Reabra a fatura ou lance manualmente.`,
      );
    }
  }

  const isShared = rec.kind === 'expense' && (shared ?? rec.shared) === true;

  // âncora estável da ocorrência: recurrence_id + occ_month/occ_year
  const existing = await db.from('transactions').select('id, status')
    .eq('recurrence_id', rec.id).eq('occ_month', month + 1).eq('occ_year', year).maybeSingle();

  if (existing.data) {
    const patch: Record<string, unknown> = {
      amount_cents: amountCents, member_id: memberId, status: 'cleared', source, date: cashDateISO, shared: isShared,
    };
    if (paidOnISO) {
      patch.ref_month = ref.refMonth;
      patch.ref_year = ref.refYear;
      if (onCard) patch.card_invoice_id = await ensureInvoice(walletId, account, chargeISO);
    }
    const { error } = await db.from('transactions').update(patch).eq('id', existing.data.id);
    if (error) throw error;
    return { created: false, onCard };
  }

  const invoiceId = onCard ? await ensureInvoice(walletId, account, chargeISO) : null;
  const { error } = await db.from('transactions').insert({
    wallet_id: walletId, account_id: account.id, kind: rec.kind, amount_cents: amountCents,
    date: cashDateISO, ref_month: ref.refMonth, ref_year: ref.refYear, status: 'cleared',
    description: rec.description, category_id: rec.category_id, member_id: memberId,
    recurrence_id: rec.id, occ_month: month + 1, occ_year: year,
    card_invoice_id: invoiceId, created_by: memberId, source, shared: isShared,
  });
  if (error) throw error;
  return { created: true, onCard };
}

/** Existe alguma transação (pendente ou não) para a ocorrência deste mês? */
export async function occurrenceTx(
  recId: string, month: number, year: number,
): Promise<{ id: string; status: string; amount_cents: number } | null> {
  const db = admin();
  const { data } = await db.from('transactions').select('id, status, amount_cents')
    .eq('recurrence_id', recId).eq('occ_month', month + 1).eq('occ_year', year).maybeSingle();
  return data ?? null;
}
