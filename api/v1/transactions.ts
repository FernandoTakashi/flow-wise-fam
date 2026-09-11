// POST   /api/v1/transactions              — criar lançamento
// PATCH  /api/v1/transactions {id, ...}     — editar
// DELETE /api/v1/transactions {id}          — excluir
//
// Reusa insertEntry/updateEntry/deleteEntry de api/_lib/finance.ts — as
// mesmas funções que já servem o bot do Telegram. Limites de saldo/cartão e
// mês fechado são aplicados pelas triggers do banco (mensagem já amigável).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadWalletBundle, insertEntry, updateEntry, deleteEntry, type EntryInput, type EntryPatch } from '../_lib/finance.js';
import { requireMember, requireUser } from './_util.js';

interface CreateBody extends Partial<EntryInput> {
  walletId?: string;
}
interface UpdateBody extends EntryPatch {
  walletId?: string;
  id?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as CreateBody;
    const { walletId } = body;
    if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }
    if (!body.kind || !body.accountId || !body.amountCents || body.amountCents <= 0 || !body.dateISO) {
      res.status(400).json({ error: 'invalid_entry' }); return;
    }
    if (!(await requireMember(db, res, walletId, user.id))) return;

    try {
      const bundle = await loadWalletBundle(walletId);
      const entry: EntryInput = {
        kind: body.kind, description: body.description ?? '', amountCents: body.amountCents,
        accountId: body.accountId, categoryId: body.categoryId ?? null, dateISO: body.dateISO,
        note: body.note ?? null, installments: body.installments ?? null,
        installmentStart: body.installmentStart ?? null, shared: body.shared ?? null,
        memberId: body.memberId ?? null, status: body.status ?? 'cleared',
        refMonth: body.refMonth ?? null, refYear: body.refYear ?? null,
      };
      const result = await insertEntry(bundle, walletId, user.id, entry, 'app');
      res.status(200).json(result);
    } catch (e) {
      res.status(400).json({ error: 'insert_failed', detail: (e as Error).message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as UpdateBody;
    const { walletId, id } = body;
    if (!walletId || !id) { res.status(400).json({ error: 'missing_fields' }); return; }
    if (!(await requireMember(db, res, walletId, user.id))) return;

    try {
      const bundle = await loadWalletBundle(walletId);
      const { walletId: _w, id: _id, ...patch } = body;
      await updateEntry(bundle, walletId, id, patch);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: 'update_failed', detail: (e as Error).message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { walletId, id } = (req.body ?? {}) as { walletId?: string; id?: string };
    if (!walletId || !id) { res.status(400).json({ error: 'missing_fields' }); return; }
    if (!(await requireMember(db, res, walletId, user.id))) return;

    try {
      await deleteEntry(walletId, id);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: 'delete_failed', detail: (e as Error).message });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
