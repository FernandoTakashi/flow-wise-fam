// GET /api/v1/snapshot?wallet=<uuid>
// Retorno único com tudo que a carteira precisa (antes: 9 queries do cliente).
// Primeiro passo da camada de API: o cliente deixa de falar 9x com o Supabase.
// Autorização: Bearer <access_token> do Supabase Auth + checagem de membro.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { admin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { res.status(401).json({ error: 'missing_token' }); return; }

  const walletId = typeof req.query.wallet === 'string' ? req.query.wallet : '';
  if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }

  const db = admin();

  const { data: userData, error: authErr } = await db.auth.getUser(token);
  const user = userData?.user;
  if (authErr || !user) { res.status(401).json({ error: 'invalid_token' }); return; }

  const { data: membership, error: memErr } = await db
    .from('wallet_members').select('role')
    .eq('wallet_id', walletId).eq('user_id', user.id).maybeSingle();
  if (memErr) { res.status(500).json({ error: 'db_error', detail: memErr.message }); return; }
  if (!membership) { res.status(403).json({ error: 'not_a_member' }); return; }

  try {
    const [members, accounts, categories, recurrences, invoices, transactions, investments, settingsRes, locks] =
      await Promise.all([
        db.from('wallet_members').select('wallet_id, user_id, role, profiles(id, name, email)').eq('wallet_id', walletId),
        db.from('accounts').select('*').eq('wallet_id', walletId).order('created_at'),
        db.from('categories').select('*').eq('wallet_id', walletId).order('name'),
        db.from('recurrences').select('*').eq('wallet_id', walletId).order('day'),
        db.from('card_invoices').select('*').eq('wallet_id', walletId),
        db.from('transactions').select('*, transaction_splits(*)').eq('wallet_id', walletId).order('date', { ascending: false }),
        db.from('investments').select('*').eq('wallet_id', walletId).order('date', { ascending: false }),
        db.from('wallet_settings').select('*').eq('wallet_id', walletId).maybeSingle(),
        db.from('period_locks').select('*').eq('wallet_id', walletId),
      ]);

    for (const r of [members, accounts, categories, recurrences, invoices, transactions, investments]) {
      if (r.error) { res.status(500).json({ error: 'db_error', detail: r.error.message }); return; }
    }

    let settings = settingsRes.data;
    if (!settings) {
      const ins = await db.from('wallet_settings').insert({ wallet_id: walletId }).select().maybeSingle();
      settings = ins.data ?? null;
    }

    const warnings: string[] = [];
    if (locks.error) warnings.push(`period_locks: ${locks.error.message}`);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      members: members.data ?? [],
      accounts: accounts.data ?? [],
      categories: categories.data ?? [],
      recurrences: recurrences.data ?? [],
      invoices: invoices.data ?? [],
      transactions: transactions.data ?? [],
      investments: investments.data ?? [],
      settings,
      periodLocks: locks.data ?? [],
      warnings,
    });
  } catch (e) {
    res.status(500).json({ error: 'internal', detail: (e as Error).message });
  }
}
