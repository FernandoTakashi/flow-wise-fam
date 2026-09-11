// GET /api/v1/wallets — carteiras em que o usuário é membro
// (renomear/excluir carteira agora fica em /api/v1/crud, resource: 'wallet')
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_util.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;

  const { data, error } = await db
    .from('wallet_members')
    .select('wallet_id, role, wallets(id, name, base_currency, created_by)')
    .eq('user_id', user.id);
  if (error) { res.status(500).json({ error: 'db_error', detail: error.message }); return; }
  const wallets = (data ?? []).map((r: any) => r.wallets).filter(Boolean);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ wallets });
}
