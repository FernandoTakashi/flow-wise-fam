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

export function refFor(
  dateISO: string, account: Pick<AccountRow, 'kind' | 'closing_day'>,
  explicit?: { refMonth?: number | null; refYear?: number | null },
): { refMonth: number; refYear: number } {
  if (account.kind === 'card') return resolveInvoiceRef(dateISO, account.closing_day ?? 1);
  if (explicit?.refMonth && explicit?.refYear) return { refMonth: explicit.refMonth, refYear: explicit.refYear };
  const { y, m } = isoParts(dateISO);
  return { refMonth: m + 1, refYear: y };
}

export async function ensureInvoice(walletId: string, card: AccountRow, dateISO: string): Promise<string> {
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
  /** parcela em que a compra está agora (1 = compra nova). Só o bot omite (sempre 1). */
  installmentStart?: number | null;
  shared?: boolean | null;
  /** quem pagou/recebeu. Omitido (bot) = quem lançou; `null` explícito (app) = sem responsável. */
  memberId?: string | null;
  status?: 'pending' | 'cleared';
  /** competência manual (só para não-cartão). Omitido = derivado da data. */
  refMonth?: number | null;
  refYear?: number | null;
}

/** Cria um lançamento (bot: avulso com parcelas/divisão opcionais; app: espelha addTransaction). */
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
  // parcela atual: só materializa da `start` até a `n` (parcelas já pagas ficam de fora)
  const start = Math.min(Math.max(1, Math.floor(entry.installmentStart ?? 1)), n);
  const parts = splitInstallments(entry.amountCents, n);
  const group = n > 1 ? randomUUID() : null;
  const status = entry.status ?? 'cleared';
  const memberId = entry.memberId === undefined ? createdBy : entry.memberId;
  const baseDesc = entry.description ?? '';

  const isShared = entry.kind === 'expense' && entry.shared === true;
  for (let k = 0; k <= n - start; k += 1) {
    const no = start + k;                                  // nº da parcela (1..n)
    const dISO = n > 1 ? addMonthsISO(entry.dateISO, k) : entry.dateISO;
    const invoiceId = onCard ? await ensureInvoice(walletId, account, dISO) : null;
    const ref = refFor(dISO, account, { refMonth: entry.refMonth, refYear: entry.refYear });
    const { error } = await db.from('transactions').insert({
      wallet_id: walletId, account_id: account.id, kind: entry.kind, amount_cents: parts[no - 1],
      date: dISO, ref_month: ref.refMonth, ref_year: ref.refYear, status,
      description: n > 1 ? `${baseDesc} (${no}/${n})` : baseDesc,
      category_id: entry.categoryId, member_id: memberId, created_by: createdBy,
      card_invoice_id: invoiceId, note: entry.note, source, shared: isShared,
      installment_group: group, installment_no: n > 1 ? no : null, installment_of: n > 1 ? n : null,
    });
    if (error) throw error;
  }
  return { accountName: account.name, onCard, parts: n };
}

/**
 * Cria/atualiza a transação de uma ocorrência de recorrência.
 * `month` é 0-11. Espelha upsertRecurrenceTx do FinanceContext.
 * `status` default 'cleared' (pagar/receber); 'pending' = só informar o valor
 * do mês (setRecurrenceOccurrenceAmount), sem mexer no saldo.
 */
export async function markOccurrence(
  bundle: WalletBundle, walletId: string, rec: RecurrenceRow,
  month: number, year: number, amountCents: number, memberId: string | null, createdBy: string, source: string,
  paidOnISO?: string, shared?: boolean, status: 'pending' | 'cleared' = 'cleared',
  accountIdOverride?: string | null,
): Promise<{ created: boolean; onCard: boolean }> {
  const db = admin();

  // conta: override do diálogo de pagamento > conta da recorrência > 1ª conta de dinheiro
  const spending = bundle.accounts.filter((a) => a.kind !== 'card' && !a.archived);
  const overrideAcc = accountIdOverride ? bundle.accounts.find((a) => a.id === accountIdOverride) : null;
  const account = overrideAcc || (rec.account_id && bundle.accounts.find((a) => a.id === rec.account_id)) || spending[0];
  if (!account) throw new Error('Escolha uma forma de pagamento para esta recorrência.');
  const onCard = account.kind === 'card';

  const dueISO = recurrenceDueISO(year, month, rec.day);
  const chargeISO = paidOnISO ?? dueISO;                            // dia da baixa

  // âncora estável da ocorrência: recurrence_id + occ_month/occ_year
  const existing = await db.from('transactions').select('id, status')
    .eq('recurrence_id', rec.id).eq('occ_month', month + 1).eq('occ_year', year).maybeSingle();
  // nunca rebaixa uma ocorrência já paga para pendente
  const nextStatus: 'pending' | 'cleared' = existing.data?.status === 'cleared' ? 'cleared' : status;

  const ref = onCard ? refFor(chargeISO, account) : { refMonth: month + 1, refYear: year };
  // data-caixa = dia da baixa (não o vencimento): senão um recebimento marcado
  // antes do dia de vencimento fica com data futura e some do saldo/projeção.
  const cashDateISO = nextStatus === 'cleared' ? chargeISO : dueISO;

  if (onCard && nextStatus === 'cleared') {
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

  if (existing.data) {
    const patch: Record<string, unknown> = { amount_cents: amountCents, status: nextStatus, source, shared: isShared };
    if (nextStatus === 'cleared') { patch.member_id = memberId; patch.date = cashDateISO; }
    if (overrideAcc && !onCard) patch.account_id = account.id;
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
    date: cashDateISO, ref_month: ref.refMonth, ref_year: ref.refYear, status: nextStatus,
    description: rec.description, category_id: rec.category_id,
    member_id: nextStatus === 'cleared' ? memberId : null,
    recurrence_id: rec.id, occ_month: month + 1, occ_year: year,
    card_invoice_id: invoiceId, created_by: createdBy, source, shared: isShared,
  });
  if (error) throw error;
  return { created: true, onCard };
}

/** Apaga a transação da ocorrência (recurrence_id + occ_month/occ_year), se houver. */
export async function unmarkOccurrence(walletId: string, recurrenceId: string, month: number, year: number): Promise<void> {
  const db = admin();
  const { error } = await db.from('transactions').delete()
    .eq('wallet_id', walletId).eq('recurrence_id', recurrenceId).eq('occ_month', month + 1).eq('occ_year', year);
  if (error) throw error;
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

export interface EntryPatch {
  description?: string;
  amountCents?: number;
  categoryId?: string | null;
  memberId?: string | null;
  status?: 'pending' | 'cleared';
  note?: string | null;
  shared?: boolean;
  dateISO?: string;
  accountId?: string;
  refMonth?: number;
  refYear?: number;
}

/** Atualiza um lançamento avulso. Espelha updateTransaction do FinanceContext. */
export async function updateEntry(bundle: WalletBundle, walletId: string, id: string, patch: EntryPatch): Promise<void> {
  const db = admin();
  const { data: current, error: curErr } = await db.from('transactions')
    .select('id, kind, date, account_id, recurrence_id, occ_month, occ_year')
    .eq('id', id).eq('wallet_id', walletId).maybeSingle();
  if (curErr) throw curErr;
  if (!current) throw new Error('Lançamento não encontrado.');

  const row: Record<string, unknown> = {};
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
  if (patch.memberId !== undefined) row.member_id = patch.memberId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.shared !== undefined) row.shared = current.kind === 'income' ? false : patch.shared;

  const nextDate = patch.dateISO ?? current.date;
  const nextAccountId = patch.accountId ?? current.account_id;
  if (patch.dateISO !== undefined) row.date = patch.dateISO;
  if (patch.accountId !== undefined) row.account_id = patch.accountId;

  const acc = bundle.accounts.find((a) => a.id === nextAccountId);
  if (patch.dateISO !== undefined || patch.accountId !== undefined) {
    row.card_invoice_id = acc?.kind === 'card' ? await ensureInvoice(walletId, acc, nextDate) : null;
  }

  // Lançamento de recorrência não-cartão: a competência fica presa à âncora da
  // ocorrência (occ_month/occ_year), não à data.
  const pinnedToOcc = current.recurrence_id && acc?.kind !== 'card' && current.occ_month != null;
  if (pinnedToOcc) {
    row.ref_month = current.occ_month;
    row.ref_year = current.occ_year;
  } else if (patch.refMonth && patch.refYear && acc?.kind !== 'card') {
    row.ref_month = patch.refMonth;
    row.ref_year = patch.refYear;
  } else if (patch.dateISO !== undefined || patch.accountId !== undefined) {
    const ref = acc
      ? refFor(nextDate, acc, { refMonth: patch.refMonth, refYear: patch.refYear })
      : refFor(nextDate, { kind: 'checking', closing_day: null }, { refMonth: patch.refMonth, refYear: patch.refYear });
    row.ref_month = ref.refMonth;
    row.ref_year = ref.refYear;
  }

  const { error } = await db.from('transactions').update(row).eq('id', id);
  if (error) throw error;
}

/** Apaga um lançamento; se for perna de pagamento de fatura, reabre a fatura e apaga o par. */
export async function deleteEntry(walletId: string, id: string): Promise<void> {
  const db = admin();
  const { data: tx } = await db.from('transactions').select('id, transfer_peer_id')
    .eq('id', id).eq('wallet_id', walletId).maybeSingle();
  if (tx?.transfer_peer_id) {
    const { data: inv } = await db.from('card_invoices').select('id')
      .eq('wallet_id', walletId).in('paid_transaction_id', [id, tx.transfer_peer_id]).maybeSingle();
    if (inv) await db.from('card_invoices').update({ status: 'open', paid_transaction_id: null }).eq('id', inv.id);
    await db.from('transactions').delete().eq('id', tx.transfer_peer_id);
  }
  const { error } = await db.from('transactions').delete().eq('id', id).eq('wallet_id', walletId);
  if (error) throw error;
}

/** Paga a fatura de um cartão: transferência da conta de origem pro cartão + fecha a fatura. */
export async function payInvoice(
  walletId: string, cardId: string, cardName: string, fromAccountId: string,
  month: number, year: number, dateISO: string, memberId: string | null, createdBy: string,
): Promise<void> {
  const db = admin();
  const refMonth = month + 1;
  const { data: invoice, error: invErr } = await db.from('card_invoices').select('id, status')
    .eq('wallet_id', walletId).eq('account_id', cardId).eq('ref_month', refMonth).eq('ref_year', year).maybeSingle();
  if (invErr) throw invErr;
  if (!invoice) throw new Error('Não há fatura para este mês.');
  if (invoice.status === 'paid') throw new Error('Fatura já está paga.');

  const { data: posted, error: postedErr } = await db.from('transactions')
    .select('amount_cents').eq('card_invoice_id', invoice.id).eq('kind', 'expense');
  if (postedErr) throw postedErr;
  const postedCents = (posted ?? []).reduce((s, t) => s + Number(t.amount_cents), 0);
  if (postedCents <= 0) throw new Error('Fatura sem lançamentos.');

  const { y: py, m: pm } = isoParts(dateISO);
  const label = `Pagamento fatura ${cardName} ${String(refMonth).padStart(2, '0')}/${year}`;

  const { data: outTx, error: outErr } = await db.from('transactions').insert({
    wallet_id: walletId, account_id: fromAccountId, kind: 'transfer', amount_cents: postedCents,
    date: dateISO, ref_month: pm + 1, ref_year: py, status: 'cleared', description: label,
    member_id: memberId, created_by: createdBy,
  }).select('id').single();
  if (outErr) throw outErr;

  const { data: inTx, error: inErr } = await db.from('transactions').insert({
    wallet_id: walletId, account_id: cardId, kind: 'transfer', amount_cents: postedCents,
    date: dateISO, ref_month: pm + 1, ref_year: py, status: 'cleared', description: label,
    member_id: memberId, transfer_peer_id: outTx.id, card_invoice_id: invoice.id, created_by: createdBy,
  }).select('id').single();
  if (inErr) throw inErr;

  await db.from('transactions').update({ transfer_peer_id: inTx.id }).eq('id', outTx.id);
  const { error: statusErr } = await db.from('card_invoices')
    .update({ status: 'paid', paid_transaction_id: outTx.id }).eq('id', invoice.id);
  if (statusErr) throw statusErr;
}

/** Estorna o pagamento de uma fatura: reabre e apaga a transferência. */
export async function unpayInvoice(walletId: string, invoiceId: string): Promise<void> {
  const db = admin();
  const { data: inv } = await db.from('card_invoices').select('id, paid_transaction_id')
    .eq('id', invoiceId).eq('wallet_id', walletId).maybeSingle();
  if (!inv?.paid_transaction_id) return;
  await db.from('card_invoices').update({ status: 'open', paid_transaction_id: null }).eq('id', invoiceId);
  const { data: tx } = await db.from('transactions').select('transfer_peer_id').eq('id', inv.paid_transaction_id).maybeSingle();
  const ids = [inv.paid_transaction_id, tx?.transfer_peer_id].filter(Boolean) as string[];
  await db.from('transactions').delete().in('id', ids);
}
