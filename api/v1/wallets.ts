// GET /api/v1/wallets — carteiras em que o usuário do token é membro.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { admin } from '../_lib/supabaseAdmin.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { res.status(401).json({ error: 'missing_token' }); return; }

  const db = admin();
  const { data: userData, error: authErr } = await db.auth.getUser(token);
  const user = userData?.user;
  if (authErr || !user) { res.status(401).json({ error: 'invalid_token' }); return; }

  const { data, error } = await db
    .from('wallet_members')
    .select('wallet_id, role, wallets(id, name, base_currency, created_by)')
    .eq('user_id', user.id);
  if (error) { res.status(500).json({ error: 'db_error', detail: error.message }); return; }

  const wallets = (data ?? []).map((r: any) => r.wallets).filter(Boolean);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ wallets });
}
