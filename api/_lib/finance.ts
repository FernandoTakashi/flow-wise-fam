// Operações de escrita no domínio financeiro a partir do backend (bot / cron).
// Espelha a lógica de FinanceContext.tsx (refFor / ensureInvoice / markRecurrence).
import { admin } from './supabaseAdmin.js';
import {
  dayOfMonthISO, invoiceDates, isoParts, resolveInvoiceRef,
} from './shared.js';

export interface AccountRow {
  id: string; wallet_id: string; name: string; kind: 'cash' | 'checking' | 'card';
  closing_day: number | null; due_day: number | null; archived: boolean;
}
export interface RecurrenceRow {
  id: string; wallet_id: string; description: string; kind: 'income' | 'expense';
  amount_cents: number; category_id: string | null; account_id: string | null;
  day: number; start_date: string; end_date: string | null; active: boolean; autopay: boolean;
}
export interface InvoiceRow {
  id: string; account_id: string; ref_month: number; ref_year: number; status: string;
}

export interface WalletBundle {
  accounts: AccountRow[];
  categories: { id: string; name: string; kind: string }[];
  recurrences: RecurrenceRow[];
  invoices: InvoiceRow[];
}

export async function loadWalletBundle(walletId: string): Promise<WalletBundle> {
  const db = admin();
  const [accs, cats, recs, invs] = await Promise.all([
    db.from('accounts').select('id, wallet_id, name, kind, closing_day, due_day, archived').eq('wallet_id', walletId),
    db.from('categories').select('id, name, kind').eq('wallet_id', walletId).eq('archived', false),
    db.from('recurrences').select('*').eq('wallet_id', walletId).eq('active', true),
    db.from('card_invoices').select('id, account_id, ref_month, ref_year, status').eq('wallet_id', walletId),
  ]);
  for (const r of [accs, cats, recs, invs]) if (r.error) throw r.error;
  return {
    accounts: (accs.data ?? []) as AccountRow[],
    categories: (cats.data ?? []) as { id: string; name: string; kind: string }[],
    recurrences: (recs.data ?? []) as RecurrenceRow[],
    invoices: (invs.data ?? []) as InvoiceRow[],
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
}

/** Cria uma transação avulsa (fluxo do bot). Retorna a linha inserida resumida. */
export async function insertEntry(
  bundle: WalletBundle, walletId: string, createdBy: string, entry: EntryInput, source: string,
): Promise<{ accountName: string; onCard: boolean }> {
  const db = admin();
  const spending = bundle.accounts.filter((a) => a.kind !== 'card' && !a.archived);
  const account =
    (entry.accountId && bundle.accounts.find((a) => a.id === entry.accountId)) || spending[0];
  if (!account) throw new Error('Nenhuma conta disponível nesta carteira.');

  const onCard = account.kind === 'card';
  const invoiceId = onCard ? await ensureInvoice(walletId, account, entry.dateISO) : null;
  const ref = refFor(entry.dateISO, account);

  const { error } = await db.from('transactions').insert({
    wallet_id: walletId, account_id: account.id, kind: entry.kind, amount_cents: entry.amountCents,
    date: entry.dateISO, ref_month: ref.refMonth, ref_year: ref.refYear, status: 'cleared',
    description: entry.description, category_id: entry.categoryId,
    member_id: createdBy, created_by: createdBy, card_invoice_id: invoiceId, note: entry.note, source,
  });
  if (error) throw error;
  return { accountName: account.name, onCard };
}

function monthRange(month: number, year: number): { start: string; end: string } {
  return { start: dayOfMonthISO(year, month, 1), end: dayOfMonthISO(year, month + 1, 0) };
}

/**
 * Marca (ou ajusta) a ocorrência de uma recorrência num mês como paga/recebida.
 * `month` é 0-11. Espelha markRecurrenceOccurrence do FinanceContext.
 */
export async function markOccurrence(
  bundle: WalletBundle, walletId: string, rec: RecurrenceRow,
  month: number, year: number, amountCents: number, memberId: string | null, source: string,
): Promise<{ created: boolean; onCard: boolean }> {
  const db = admin();
  const { start, end } = monthRange(month, year);

  const existing = await db.from('transactions').select('id, status')
    .eq('recurrence_id', rec.id).gte('date', start).lte('date', end).maybeSingle();

  if (existing.data) {
    const { error } = await db.from('transactions')
      .update({ amount_cents: amountCents, member_id: memberId, status: 'cleared', source })
      .eq('id', existing.data.id);
    if (error) throw error;
    return { created: false, onCard: false };
  }

  const spending = bundle.accounts.filter((a) => a.kind !== 'card' && !a.archived);
  const account = (rec.account_id && bundle.accounts.find((a) => a.id === rec.account_id)) || spending[0];
  if (!account) throw new Error('Defina uma conta padrão para esta recorrência.');

  const onCard = account.kind === 'card';
  const dISO = dayOfMonthISO(year, month, rec.day);
  const invoiceId = onCard ? await ensureInvoice(walletId, account, dISO) : null;
  const ref = refFor(dISO, account);

  const { error } = await db.from('transactions').insert({
    wallet_id: walletId, account_id: account.id, kind: rec.kind, amount_cents: amountCents,
    date: dISO, ref_month: ref.refMonth, ref_year: ref.refYear, status: 'cleared',
    description: rec.description, category_id: rec.category_id, member_id: memberId,
    recurrence_id: rec.id, card_invoice_id: invoiceId, created_by: memberId, source,
  });
  if (error) throw error;
  return { created: true, onCard };
}

/** Existe alguma transação (pendente ou não) para a ocorrência deste mês? */
export async function occurrenceTx(
  recId: string, month: number, year: number,
): Promise<{ id: string; status: string; amount_cents: number } | null> {
  const db = admin();
  const { start, end } = monthRange(month, year);
  const { data } = await db.from('transactions').select('id, status, amount_cents')
    .eq('recurrence_id', recId).gte('date', start).lte('date', end).maybeSingle();
  return data ?? null;
}
