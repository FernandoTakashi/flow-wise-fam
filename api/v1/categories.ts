// POST   /api/v1/categories {walletId, ...}    — criar
// PATCH  /api/v1/categories {walletId, id, ...} — editar
// DELETE /api/v1/categories {walletId, id}      — excluir (ou arquiva, se em uso)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMember, requireRowInWallet, requireUser } from './_util.js';

interface Body {
  walletId?: string;
  id?: string;
  name?: string;
  kind?: 'income' | 'expense';
  icon?: string | null;
  color?: string | null;
  archived?: boolean;
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
    if (!body.name || !body.kind) { res.status(400).json({ error: 'invalid_category' }); return; }
    const { error } = await db.from('categories').insert({
      wallet_id: walletId, name: body.name, kind: body.kind, icon: body.icon ?? null, color: body.color ?? null,
    });
    if (error) { res.status(400).json({ error: 'insert_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'PATCH') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'categories', body.id, walletId))) return;
    const row: Record<string, unknown> = {};
    if (body.name !== undefined) row.name = body.name;
    if (body.icon !== undefined) row.icon = body.icon;
    if (body.color !== undefined) row.color = body.color;
    if (body.archived !== undefined) row.archived = body.archived;
    const { error } = await db.from('categories').update(row).eq('id', body.id);
    if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'categories', body.id, walletId))) return;
    const { count, error: cntErr } = await db.from('transactions')
      .select('id', { count: 'exact', head: true }).eq('category_id', body.id);
    if (cntErr) { res.status(500).json({ error: 'db_error', detail: cntErr.message }); return; }
    const { error } = (count ?? 0) > 0
      ? await db.from('categories').update({ archived: true }).eq('id', body.id)
      : await db.from('categories').delete().eq('id', body.id);
    if (error) { res.status(400).json({ error: 'delete_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
