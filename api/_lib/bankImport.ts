// Open Finance (Pluggy) — importação de lançamentos.
// Nas contas ligadas (bank_accounts.account_id) com data de corte
// (import_from), o banco é a fonte da verdade: cada sincronização reconcilia
// a janela [import_from, ∞) inteira — cria o que chegou, atualiza o que mudou
// (valor, data, pendente→postado) e apaga o que o banco não manda mais.
// Campos de classificação (categoria, responsável, conjunto, grupo 50/30/20,
// fixo, nota) são do usuário e nunca são sobrescritos.
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTransactions, type PluggyCreds, type PluggyTransaction } from './pluggy.js';
import { credsForConnection } from './pluggyCreds.js';
import { invoiceDates, isoParts, resolveInvoiceRef, spDateISO } from './shared.js';

const SOURCE = 'pluggy';
const MATCH_WINDOW_DAYS = 3;

// "Pagamento de fatura" na conta corrente / pagamento recebido no cartão:
// é transferência (quita a fatura), não despesa nem receita.
const BANK_BILL_PAYMENT = /pagamento\s+(de\s+)?fatura|pagto\.?\s*fatura|pag\.?\s*fatura|fatura\s+cart/i;
const CARD_PAYMENT = /pagamento|pagto|pgto/i;

interface CardAccount { id: string; kind: string; closing_day: number | null; due_day: number | null }

export interface ImportTarget {
  walletId: string;
  /** conta do app */
  account: CardAccount;
  /** conta na Pluggy */
  externalAccountId: string;
  importFrom: string;
  /** quem conectou o banco — vira responsável/autor dos lançamentos importados */
  ownerId: string | null;
  /** credencial da Pluggy da conexão dessa conta */
  creds: PluggyCreds;
}

export interface ImportResult { created: number; updated: number; deleted: number; errors: string[] }

/** Linha de transação do app derivada de um lançamento da Pluggy (sem os campos de classificação). */
export interface MappedTx {
  external_id: string;
  kind: 'income' | 'expense' | 'transfer';
  amount_cents: number;
  date: string;
  status: 'pending' | 'cleared';
  description: string;
  transfer_credit: boolean;
  ref_month: number;
  ref_year: number;
  installment_no: number | null;
  installment_of: number | null;
  /** só cartão (despesa/estorno): competência da fatura */
  invoiceRef: { refMonth: number; refYear: number } | null;
}

/** Pura — testável sem rede nem banco. */
export function mapPluggyTx(p: PluggyTransaction, account: Pick<CardAccount, 'kind' | 'closing_day'>): MappedTx {
  const isCard = account.kind === 'card';
  const date = spDateISO(new Date(p.date));
  const cents = Math.round(Math.abs(p.amount) * 100);
  const desc = (p.description || p.descriptionRaw || '').trim();
  const cc = p.creditCardMetadata ?? null;

  let kind: MappedTx['kind'];
  let transferCredit = false;
  if (isCard) {
    if (p.amount >= 0) kind = 'expense';                                   // compra
    else if (CARD_PAYMENT.test(desc) || p.operationType === 'PAGAMENTO_FATURA') { kind = 'transfer'; transferCredit = true; }
    else kind = 'income';                                                  // estorno/crédito
  } else if (p.amount < 0) {
    kind = BANK_BILL_PAYMENT.test(desc) ? 'transfer' : 'expense';
  } else {
    kind = 'income';
  }

  let invoiceRef: MappedTx['invoiceRef'] = null;
  if (isCard && kind !== 'transfer') {
    const m = /^(\d{4})-(\d{2})/.exec(cc?.billForecastDate ?? '');
    invoiceRef = m
      ? { refMonth: Number(m[2]), refYear: Number(m[1]) }
      : resolveInvoiceRef(date, account.closing_day ?? 1);
  }
  const { y, m } = isoParts(date);
  const ref = invoiceRef ?? { refMonth: m + 1, refYear: y };
  const totalInst = cc?.totalInstallments && cc.totalInstallments > 1 ? cc.totalInstallments : null;

  return {
    external_id: p.id,
    kind,
    amount_cents: cents,
    date,
    status: p.status === 'PENDING' ? 'pending' : 'cleared',
    description: desc,
    transfer_credit: transferCredit,
    ref_month: ref.refMonth,
    ref_year: ref.refYear,
    installment_no: totalInst ? (cc?.installmentNumber ?? null) : null,
    installment_of: totalInst,
    invoiceRef,
  };
}

const dayDiff = (a: string, b: string) =>
  Math.abs((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);

interface ExistingRow {
  id: string; external_id: string | null; kind: string; amount_cents: number; date: string; status: string;
  description: string; transfer_credit: boolean; ref_month: number; ref_year: number;
  installment_no: number | null; installment_of: number | null; card_invoice_id: string | null;
}

async function ensureInvoiceRef(
  db: SupabaseClient, walletId: string, card: CardAccount, refMonth: number, refYear: number,
  cache: Map<string, string>,
): Promise<string> {
  const key = `${refYear}-${refMonth}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const found = await db.from('card_invoices').select('id')
    .eq('account_id', card.id).eq('ref_year', refYear).eq('ref_month', refMonth).maybeSingle();
  if (found.error) throw found.error;
  let id = found.data?.id as string | undefined;
  if (!id) {
    const closing = card.closing_day ?? 1;
    const { closingDate, dueDate } = invoiceDates(refMonth, refYear, closing, card.due_day ?? closing);
    const ins = await db.from('card_invoices').insert({
      wallet_id: walletId, account_id: card.id, ref_month: refMonth, ref_year: refYear,
      closing_date: closingDate, due_date: dueDate, status: 'open',
    }).select('id').single();
    if (ins.error) throw ins.error;
    id = ins.data.id as string;
  }
  cache.set(key, id);
  return id;
}

/** Reconcilia os lançamentos de uma conta ligada com o que a Pluggy manda. */
export async function importAccount(db: SupabaseClient, t: ImportTarget): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, deleted: 0, errors: [] };
  const remote = (await listTransactions(t.creds, t.externalAccountId, t.importFrom))
    .map((p) => mapPluggyTx(p, t.account))
    // a Pluggy filtra por data em UTC; a regra do corte é pela data de SP
    .filter((m) => m.date >= t.importFrom && m.amount_cents > 0);
  const remoteIds = new Set(remote.map((m) => m.external_id));

  const ex = await db.from('transactions')
    .select('id, external_id, kind, amount_cents, date, status, description, transfer_credit, ref_month, ref_year, installment_no, installment_of, card_invoice_id')
    .eq('wallet_id', t.walletId).eq('account_id', t.account.id).eq('external_source', SOURCE).gte('date', t.importFrom);
  if (ex.error) throw ex.error;
  const existing = (ex.data ?? []) as ExistingRow[];
  const byExt = new Map(existing.filter((r) => r.external_id).map((r) => [r.external_id!, r]));
  const seen = new Set<string>();
  // candidatos a "mesmo lançamento com id novo": importados cujo id a Pluggy não manda mais
  const orphans = existing.filter((r) => !r.external_id || !remoteIds.has(r.external_id));

  const invoiceCache = new Map<string, string>();
  const toInsert: Record<string, unknown>[] = [];

  for (const m of remote) {
    try {
      const invoiceId = m.invoiceRef
        ? await ensureInvoiceRef(db, t.walletId, t.account, m.invoiceRef.refMonth, m.invoiceRef.refYear, invoiceCache)
        : null;
      const fields = {
        external_id: m.external_id, kind: m.kind, amount_cents: m.amount_cents, date: m.date, status: m.status,
        description: m.description, transfer_credit: m.transfer_credit, ref_month: m.ref_month, ref_year: m.ref_year,
        installment_no: m.installment_no, installment_of: m.installment_of, card_invoice_id: invoiceId,
      };

      let row = byExt.get(m.external_id);
      if (!row) {
        row = orphans.find((o) => !seen.has(o.id) && o.kind === m.kind && Number(o.amount_cents) === m.amount_cents
          && (o.installment_no ?? null) === m.installment_no && dayDiff(o.date, m.date) <= MATCH_WINDOW_DAYS);
      }
      if (row) {
        seen.add(row.id);
        const changed = (Object.keys(fields) as (keyof typeof fields)[])
          .some((k) => String(fields[k] ?? '') !== String((row as unknown as Record<string, unknown>)[k] ?? ''));
        if (changed) {
          const upd = await db.from('transactions').update(fields).eq('id', row.id);
          if (upd.error) throw upd.error;
          result.updated += 1;
        }
      } else {
        toInsert.push({
          ...fields, wallet_id: t.walletId, account_id: t.account.id, external_source: SOURCE, source: 'import',
          member_id: t.ownerId, created_by: t.ownerId,
        });
      }
    } catch (e) {
      result.errors.push(`${m.date} ${m.description}: ${(e as Error).message}`);
    }
  }

  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const ins = await db.from('transactions').insert(chunk);
    if (!ins.error) { result.created += chunk.length; continue; }
    // um lançamento ruim (ex.: fatura paga/mês fechado) não derruba o lote inteiro
    for (const r of chunk) {
      const one = await db.from('transactions').insert(r);
      if (one.error) result.errors.push(`${r.date} ${r.description}: ${one.error.message}`);
      else result.created += 1;
    }
  }

  const gone = existing.filter((r) => !seen.has(r.id) && (!r.external_id || !remoteIds.has(r.external_id)));
  for (const r of gone) {
    const del = await db.from('transactions').delete().eq('id', r.id);
    if (del.error) result.errors.push(`${r.date} ${r.description}: ${del.error.message}`);
    else result.deleted += 1;
  }
  return result;
}

/** Importa todas as contas ligadas (com data de corte) de uma carteira. */
export async function importWallet(db: SupabaseClient, walletId: string): Promise<ImportResult & { accounts: number }> {
  const links = await db.from('bank_accounts')
    .select('id, external_account_id, import_from, account_id, bank_connections(created_by, credential_id), accounts(id, kind, closing_day, due_day)')
    .eq('wallet_id', walletId).not('account_id', 'is', null).not('import_from', 'is', null);
  if (links.error) throw links.error;

  const total: ImportResult & { accounts: number } = { created: 0, updated: 0, deleted: 0, errors: [], accounts: 0 };
  for (const l of links.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acc = (l as any).accounts as CardAccount | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (l as any).bank_connections as { created_by: string | null; credential_id: string | null } | null;
    if (!acc) continue;
    try {
      const r = await importAccount(db, {
        walletId, account: acc, externalAccountId: l.external_account_id as string,
        importFrom: l.import_from as string, ownerId: conn?.created_by ?? null,
        creds: await credsForConnection(db, conn?.credential_id),
      });
      total.created += r.created; total.updated += r.updated; total.deleted += r.deleted;
      total.errors.push(...r.errors);
      total.accounts += 1;
      await db.from('bank_accounts').update({ last_import_at: new Date().toISOString() }).eq('id', l.id);
    } catch (e) {
      total.errors.push((e as Error).message);
    }
  }
  return total;
}

/**
 * Conta do app ligada a uma conta do banco, com corte já em vigor na data?
 * Nesses casos o lançamento manual é bloqueado — o banco manda.
 */
export async function bankManagedSince(db: SupabaseClient, accountId: string): Promise<string | null> {
  const r = await db.from('bank_accounts').select('import_from').eq('account_id', accountId).maybeSingle();
  if (r.error) throw r.error;
  return (r.data?.import_from as string | null) ?? null;
}
