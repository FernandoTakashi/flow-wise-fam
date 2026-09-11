// POST /api/v1/invoices  body: { walletId, action: 'pay'|'unpay'|'setStatus', ... }
// Espelha payCardInvoice / unpayCardInvoice / setInvoiceStatus do FinanceContext.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { payInvoice, unpayInvoice } from '../_lib/finance.js';
import { requireMember, requireUser } from './_util.js';

interface Body {
  walletId?: string;
  action?: 'pay' | 'unpay' | 'setStatus';
  cardId?: string;
  cardName?: string;
  fromAccountId?: string;
  month?: number;
  year?: number;
  dateISO?: string;
  memberId?: string | null;
  invoiceId?: string;
  status?: 'open' | 'closed';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;

  const body = (req.body ?? {}) as Body;
  const { walletId, action } = body;
  if (!walletId || !action) { res.status(400).json({ error: 'missing_fields' }); return; }
  if (!(await requireMember(db, res, walletId, user.id))) return;

  try {
    if (action === 'pay') {
      const { cardId, cardName, fromAccountId, dateISO } = body;
      if (!cardId || !fromAccountId || !dateISO || typeof body.month !== 'number' || typeof body.year !== 'number') {
        res.status(400).json({ error: 'missing_fields' }); return;
      }
      await payInvoice(walletId, cardId, cardName ?? 'cartão', fromAccountId, body.month, body.year, dateISO, body.memberId ?? null, user.id);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'unpay') {
      if (!body.invoiceId) { res.status(400).json({ error: 'missing_invoice' }); return; }
      await unpayInvoice(walletId, body.invoiceId);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'setStatus') {
      if (!body.invoiceId || !body.status) { res.status(400).json({ error: 'missing_fields' }); return; }
      const { error } = await db.from('card_invoices').update({ status: body.status })
        .eq('id', body.invoiceId).eq('wallet_id', walletId);
      if (error) { res.status(400).json({ error: 'operation_failed', detail: error.message }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (e) {
    res.status(400).json({ error: 'operation_failed', detail: (e as Error).message });
  }
}
