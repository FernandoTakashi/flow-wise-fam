// POST   /api/v1/recurrences {walletId, ...}      — criar
// PATCH  /api/v1/recurrences {walletId, id, ...}   — editar
// DELETE /api/v1/recurrences {walletId, id}        — excluir (solta os lançamentos já gerados)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMember, requireRowInWallet, requireUser } from './_util.js';

interface Body {
  walletId?: string;
  id?: string;
  description?: string;
  kind?: 'income' | 'expense';
  amountCents?: number;
  categoryId?: string | null;
  accountId?: string | null;
  day?: number;
  startDate?: string;
  endDate?: string | null;
  autopay?: boolean;
  variableAmount?: boolean;
  shared?: boolean;
  installmentsTotal?: number | null;
  installmentsDone?: number;
  active?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;
  const body = (req.body ?? {}) as Body;
  const { walletId } = body;
  if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }
  if (!(await requireMember(db, res, walletId, user.id))) return;

  if (req.method === 'POST') {
    if (!body.description || !body.kind || !body.amountCents || !body.day || !body.startDate) {
      res.status(400).json({ error: 'invalid_recurrence' }); return;
    }
    const { error } = await db.from('recurrences').insert({
      wallet_id: walletId, description: body.description, kind: body.kind, amount_cents: body.amountCents,
      category_id: body.categoryId ?? null, account_id: body.accountId ?? null, day: body.day,
      start_date: body.startDate, end_date: body.endDate ?? null,
      autopay: body.autopay ?? false, variable_amount: body.variableAmount ?? false, shared: body.shared ?? false,
      installments_total: body.installmentsTotal ?? null, installments_done: body.installmentsDone ?? 0,
    });
    if (error) { res.status(400).json({ error: 'insert_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'PATCH') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'recurrences', body.id, walletId))) return;
    const row: Record<string, unknown> = {};
    if (body.description !== undefined) row.description = body.description;
    if (body.amountCents !== undefined) row.amount_cents = body.amountCents;
    if (body.categoryId !== undefined) row.category_id = body.categoryId;
    if (body.accountId !== undefined) row.account_id = body.accountId;
    if (body.day !== undefined) row.day = body.day;
    if (body.startDate !== undefined) row.start_date = body.startDate;
    if (body.endDate !== undefined) row.end_date = body.endDate;
    if (body.autopay !== undefined) row.autopay = body.autopay;
    if (body.variableAmount !== undefined) row.variable_amount = body.variableAmount;
    if (body.shared !== undefined) row.shared = body.shared;
    if (body.installmentsTotal !== undefined) row.installments_total = body.installmentsTotal;
    if (body.installmentsDone !== undefined) row.installments_done = body.installmentsDone;
    if (body.active !== undefined) row.active = body.active;
    const { error } = await db.from('recurrences').update(row).eq('id', body.id);
    if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'recurrences', body.id, walletId))) return;
    const { error: uErr } = await db.from('transactions')
      .update({ recurrence_id: null, occ_month: null, occ_year: null }).eq('recurrence_id', body.id);
    if (uErr) { res.status(400).json({ error: 'delete_failed', detail: uErr.message }); return; }
    const { error } = await db.from('recurrences').delete().eq('id', body.id);
    if (error) { res.status(400).json({ error: 'delete_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
