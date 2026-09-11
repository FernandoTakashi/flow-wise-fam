// PATCH /api/v1/settings {walletId, initialInvestmentCents?, defaultYieldBps?}
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMember, requireUser } from './_util.js';

interface Body {
  walletId?: string;
  initialInvestmentCents?: number;
  defaultYieldBps?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;

  const body = (req.body ?? {}) as Body;
  const { walletId } = body;
  if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }
  if (!(await requireMember(db, res, walletId, user.id))) return;

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.initialInvestmentCents !== undefined) row.initial_investment_cents = body.initialInvestmentCents;
  if (body.defaultYieldBps !== undefined) row.default_yield_bps = body.defaultYieldBps;

  const { error } = await db.from('wallet_settings').update(row).eq('wallet_id', walletId);
  if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
  res.status(200).json({ ok: true });
}
