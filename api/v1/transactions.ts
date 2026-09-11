// POST /api/v1/transactions — cria um lançamento (espelha addTransaction do
// FinanceContext). Reusa a mesma insertEntry() que já serve o bot do Telegram.
// Autorização: Bearer <access_token> do Supabase Auth + checagem de membro.
// Limites de saldo/limite de cartão são aplicados pela trigger do banco
// (enforce_spend_limits) — o erro dela já vem com mensagem amigável.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { admin } from '../_lib/supabaseAdmin.js';
import { loadWalletBundle, insertEntry, type EntryInput } from '../_lib/finance.js';

interface Body {
  walletId?: string;
  kind?: 'income' | 'expense';
  description?: string;
  amountCents?: number;
  accountId?: string | null;
  categoryId?: string | null;
  dateISO?: string;
  note?: string | null;
  installments?: number | null;
  installmentStart?: number | null;
  shared?: boolean | null;
  memberId?: string | null;
  status?: 'pending' | 'cleared';
  refMonth?: number | null;
  refYear?: number | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { res.status(401).json({ error: 'missing_token' }); return; }

  const db = admin();
  const { data: userData, error: authErr } = await db.auth.getUser(token);
  const user = userData?.user;
  if (authErr || !user) { res.status(401).json({ error: 'invalid_token' }); return; }

  const body = (req.body ?? {}) as Body;
  const { walletId } = body;
  if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }
  if (!body.kind || !body.accountId || !body.amountCents || body.amountCents <= 0) {
    res.status(400).json({ error: 'invalid_entry' });
    return;
  }
  if (!body.dateISO) { res.status(400).json({ error: 'missing_date' }); return; }

  const { data: membership, error: memErr } = await db
    .from('wallet_members').select('role').eq('wallet_id', walletId).eq('user_id', user.id).maybeSingle();
  if (memErr) { res.status(500).json({ error: 'db_error', detail: memErr.message }); return; }
  if (!membership) { res.status(403).json({ error: 'not_a_member' }); return; }

  try {
    const bundle = await loadWalletBundle(walletId);
    const entry: EntryInput = {
      kind: body.kind,
      description: body.description ?? '',
      amountCents: body.amountCents,
      accountId: body.accountId,
      categoryId: body.categoryId ?? null,
      dateISO: body.dateISO,
      note: body.note ?? null,
      installments: body.installments ?? null,
      installmentStart: body.installmentStart ?? null,
      shared: body.shared ?? null,
      memberId: body.memberId ?? null,
      status: body.status ?? 'cleared',
      refMonth: body.refMonth ?? null,
      refYear: body.refYear ?? null,
    };
    const result = await insertEntry(bundle, walletId, user.id, entry, 'app');
    res.status(200).json(result);
  } catch (e) {
    res.status(400).json({ error: 'insert_failed', detail: (e as Error).message });
  }
}
