// POST   /api/v1/investments {walletId, ...}    — criar
// PATCH  /api/v1/investments {walletId, id, ...} — editar
// DELETE /api/v1/investments {walletId, id}      — excluir
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMember, requireRowInWallet, requireUser } from './_util.js';

interface Body {
  walletId?: string;
  id?: string;
  description?: string;
  amountCents?: number;
  yieldRateBps?: number;
  dateISO?: string;
  memberId?: string | null;
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
    if (!body.description || !body.amountCents || !body.dateISO) { res.status(400).json({ error: 'invalid_investment' }); return; }
    const { error } = await db.from('investments').insert({
      wallet_id: walletId, description: body.description, amount_cents: body.amountCents,
      yield_rate_bps: body.yieldRateBps ?? 0, date: body.dateISO, member_id: body.memberId ?? null,
    });
    if (error) { res.status(400).json({ error: 'insert_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'PATCH') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'investments', body.id, walletId))) return;
    const row: Record<string, unknown> = {};
    if (body.description !== undefined) row.description = body.description;
    if (body.amountCents !== undefined) row.amount_cents = body.amountCents;
    if (body.yieldRateBps !== undefined) row.yield_rate_bps = body.yieldRateBps;
    if (body.dateISO !== undefined) row.date = body.dateISO;
    if (body.memberId !== undefined) row.member_id = body.memberId;
    const { error } = await db.from('investments').update(row).eq('id', body.id);
    if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'investments', body.id, walletId))) return;
    const { error } = await db.from('investments').delete().eq('id', body.id);
    if (error) { res.status(400).json({ error: 'delete_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
