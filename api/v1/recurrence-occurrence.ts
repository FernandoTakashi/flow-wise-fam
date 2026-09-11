// POST /api/v1/recurrence-occurrence
// body: { walletId, recurrenceId, month, year, action: 'mark'|'unmark'|'setAmount', ... }
// Espelha markRecurrenceOccurrence / setRecurrenceOccurrenceAmount /
// unmarkRecurrenceOccurrence do FinanceContext, reusando markOccurrence() —
// a mesma função que já serve o bot.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadWalletBundle, markOccurrence, unmarkOccurrence } from '../_lib/finance.js';
import { requireMember, requireUser } from './_util.js';

interface Body {
  walletId?: string;
  recurrenceId?: string;
  month?: number;
  year?: number;
  action?: 'mark' | 'unmark' | 'setAmount';
  amountCents?: number;
  memberId?: string | null;
  paidOnISO?: string;
  shared?: boolean;
  /** conta de débito escolhida no ato do pagamento (só fixo não-cartão) */
  accountId?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;

  const body = (req.body ?? {}) as Body;
  const { walletId, recurrenceId, action } = body;
  if (!walletId || !recurrenceId || typeof body.month !== 'number' || typeof body.year !== 'number' || !action) {
    res.status(400).json({ error: 'missing_fields' }); return;
  }
  if (!(await requireMember(db, res, walletId, user.id))) return;

  try {
    if (action === 'unmark') {
      await unmarkOccurrence(walletId, recurrenceId, body.month, body.year);
      res.status(200).json({ ok: true });
      return;
    }

    const bundle = await loadWalletBundle(walletId);
    const rec = bundle.recurrences.find((r) => r.id === recurrenceId);
    if (!rec) { res.status(404).json({ error: 'recurrence_not_found' }); return; }

    if (action === 'mark') {
      if (!body.amountCents || body.amountCents <= 0) { res.status(400).json({ error: 'invalid_amount' }); return; }
      const result = await markOccurrence(
        bundle, walletId, rec, body.month, body.year, body.amountCents,
        body.memberId ?? null, user.id, 'app', body.paidOnISO, body.shared, 'cleared', body.accountId ?? null,
      );
      res.status(200).json(result);
      return;
    }

    if (action === 'setAmount') {
      if (!body.amountCents || body.amountCents <= 0) { res.status(400).json({ error: 'invalid_amount' }); return; }
      const result = await markOccurrence(
        bundle, walletId, rec, body.month, body.year, body.amountCents,
        null, user.id, 'app', undefined, undefined, 'pending',
      );
      res.status(200).json(result);
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (e) {
    res.status(400).json({ error: 'operation_failed', detail: (e as Error).message });
  }
}
