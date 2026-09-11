// POST /api/v1/periods {walletId, month, year, action: 'lock'|'unlock'}
// Só o dono da carteira pode fechar/reabrir mês (mesma regra da RLS
// period_locks_owner_write, reimplementada aqui porque a API usa service role).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMember, requireUser } from './_util.js';

interface Body {
  walletId?: string;
  month?: number;
  year?: number;
  action?: 'lock' | 'unlock';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;

  const body = (req.body ?? {}) as Body;
  const { walletId, action } = body;
  if (!walletId || !action || typeof body.month !== 'number' || typeof body.year !== 'number') {
    res.status(400).json({ error: 'missing_fields' }); return;
  }
  if (!(await requireMember(db, res, walletId, user.id, true))) return;

  if (action === 'lock') {
    const { error } = await db.from('period_locks')
      .insert({ wallet_id: walletId, ref_month: body.month + 1, ref_year: body.year, locked_by: user.id });
    if (error && error.code !== '23505') { res.status(400).json({ error: 'operation_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'unlock') {
    const { error } = await db.from('period_locks').delete()
      .eq('wallet_id', walletId).eq('ref_month', body.month + 1).eq('ref_year', body.year);
    if (error) { res.status(400).json({ error: 'operation_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ error: 'invalid_action' });
}
