// GET    /api/v1/wallets            — carteiras em que o usuário é membro
// PATCH  /api/v1/wallets  {id,name}  — renomear (dono)
// DELETE /api/v1/wallets  {id}       — excluir (dono)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMember, requireUser } from './_util.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('wallet_members')
      .select('wallet_id, role, wallets(id, name, base_currency, created_by)')
      .eq('user_id', user.id);
    if (error) { res.status(500).json({ error: 'db_error', detail: error.message }); return; }
    const wallets = (data ?? []).map((r: any) => r.wallets).filter(Boolean);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ wallets });
    return;
  }

  if (req.method === 'PATCH') {
    const { id, name } = (req.body ?? {}) as { id?: string; name?: string };
    if (!id || !name) { res.status(400).json({ error: 'missing_fields' }); return; }
    if (!(await requireMember(db, res, id, user.id, true))) return;
    const { error } = await db.from('wallets').update({ name }).eq('id', id);
    if (error) { res.status(400).json({ error: 'operation_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = (req.body ?? {}) as { id?: string };
    if (!id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireMember(db, res, id, user.id, true))) return;
    const { count } = await db.from('wallet_members').select('wallet_id', { count: 'exact', head: true }).eq('user_id', user.id);
    if ((count ?? 0) <= 1) { res.status(400).json({ error: 'operation_failed', detail: 'Você precisa manter ao menos uma carteira.' }); return; }
    const { error } = await db.from('wallets').delete().eq('id', id);
    if (error) { res.status(400).json({ error: 'operation_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
