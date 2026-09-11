// POST /api/v1/actions   body: { resource, walletId, action, ... }
// resource: 'occurrence' | 'invoice' | 'period'
//
// Agrupa os endpoints "de verbo" (não são CRUD simples) num único arquivo —
// o plano Hobby da Vercel limita a 12 Serverless Functions por deployment.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  loadWalletBundle, markOccurrence, unmarkOccurrence, payInvoice, unpayInvoice,
} from '../_lib/finance.js';
import { requireMember, requireUser } from './_util.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any> & { resource?: string; walletId?: string; action?: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;

  const body = (req.body ?? {}) as Body;
  const { resource, walletId, action } = body;
  if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }
  if (!resource || !action) { res.status(400).json({ error: 'missing_fields' }); return; }

  // fechar/reabrir mês é só do dono; os demais, qualquer membro
  if (!(await requireMember(db, res, walletId, user.id, resource === 'period'))) return;

  try {
    switch (resource) {
      case 'occurrence': await occurrence(req, res, walletId, user.id, body); return;
      case 'invoice': await invoice(req, res, db, walletId, user.id, body); return;
      case 'period': await period(req, res, db, walletId, user.id, body); return;
      default: res.status(400).json({ error: 'invalid_resource' });
    }
  } catch (e) {
    res.status(400).json({ error: 'operation_failed', detail: (e as Error).message });
  }
}

// --- occurrence (espelha markRecurrenceOccurrence / setRecurrenceOccurrenceAmount / unmarkRecurrenceOccurrence) ---
async function occurrence(req: VercelRequest, res: VercelResponse, walletId: string, userId: string, body: Body) {
  const { recurrenceId, action } = body;
  if (!recurrenceId || typeof body.month !== 'number' || typeof body.year !== 'number') {
    res.status(400).json({ error: 'missing_fields' }); return;
  }

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
      body.memberId ?? null, userId, 'app', body.paidOnISO, body.shared, 'cleared', body.accountId ?? null,
    );
    res.status(200).json(result);
    return;
  }

  if (action === 'setAmount') {
    if (!body.amountCents || body.amountCents <= 0) { res.status(400).json({ error: 'invalid_amount' }); return; }
    const result = await markOccurrence(
      bundle, walletId, rec, body.month, body.year, body.amountCents,
      null, userId, 'app', undefined, undefined, 'pending',
    );
    res.status(200).json(result);
    return;
  }

  res.status(400).json({ error: 'invalid_action' });
}

// --- invoice (espelha payCardInvoice / unpayCardInvoice / setInvoiceStatus) ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invoice(req: VercelRequest, res: VercelResponse, db: any, walletId: string, userId: string, body: Body) {
  const { action } = body;

  if (action === 'pay') {
    const { cardId, cardName, fromAccountId, dateISO } = body;
    if (!cardId || !fromAccountId || !dateISO || typeof body.month !== 'number' || typeof body.year !== 'number') {
      res.status(400).json({ error: 'missing_fields' }); return;
    }
    await payInvoice(walletId, cardId, cardName ?? 'cartão', fromAccountId, body.month, body.year, dateISO, body.memberId ?? null, userId);
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
}

// --- period (espelha lockPeriod / unlockPeriod — só dono, checado no handler principal) ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function period(req: VercelRequest, res: VercelResponse, db: any, walletId: string, userId: string, body: Body) {
  const { action } = body;
  if (typeof body.month !== 'number' || typeof body.year !== 'number') {
    res.status(400).json({ error: 'missing_fields' }); return;
  }

  if (action === 'lock') {
    const { error } = await db.from('period_locks')
      .insert({ wallet_id: walletId, ref_month: body.month + 1, ref_year: body.year, locked_by: userId });
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
