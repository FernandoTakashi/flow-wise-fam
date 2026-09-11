// POST   /api/v1/members {walletId, email}      — convidar (só dono)
// DELETE /api/v1/members {walletId, userId}     — remover (só dono)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMember, requireUser } from './_util.js';

interface Body {
  walletId?: string;
  email?: string;
  userId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;
  const body = (req.body ?? {}) as Body;
  const { walletId } = body;
  if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }
  if (!(await requireMember(db, res, walletId, user.id, true))) return;

  if (req.method === 'POST') {
    const email = body.email?.trim();
    if (!email) { res.status(400).json({ error: 'missing_email' }); return; }

    const { data: uid, error } = await db.rpc('find_user_id_by_email', { p_email: email });
    if (error) {
      const missingFn = error.code === 'PGRST202' || /function .*find_user_id_by_email/i.test(error.message);
      res.status(400).json({
        error: 'operation_failed',
        detail: missingFn ? 'Falta aplicar a migração 20260908000005 no Supabase.' : error.message,
      });
      return;
    }
    if (!uid) {
      res.status(400).json({
        error: 'operation_failed',
        detail: `Nenhuma conta encontrada para "${email}". Confira o e-mail (Supabase → Authentication → Users) — precisa ser o mesmo do cadastro.`,
      });
      return;
    }
    const { error: mErr } = await db.from('wallet_members').insert({ wallet_id: walletId, user_id: uid as string, role: 'member' });
    if (mErr) {
      res.status(400).json({
        error: 'operation_failed',
        detail: mErr.code === '23505' ? 'Essa pessoa já é membro desta carteira.' : mErr.message,
      });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    if (!body.userId) { res.status(400).json({ error: 'missing_user' }); return; }
    if (body.userId === user.id) { res.status(400).json({ error: 'operation_failed', detail: 'Use "sair da carteira" para remover a si mesmo.' }); return; }
    const { error } = await db.from('wallet_members').delete().eq('wallet_id', walletId).eq('user_id', body.userId);
    if (error) { res.status(400).json({ error: 'operation_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
