// POST   /api/v1/accounts {walletId, ...}    — criar
// PATCH  /api/v1/accounts {walletId, id, ...} — editar
// DELETE /api/v1/accounts {walletId, id}      — excluir (só sem lançamentos)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMember, requireRowInWallet, requireUser } from './_util.js';

interface Body {
  walletId?: string;
  id?: string;
  name?: string;
  kind?: 'cash' | 'checking' | 'card';
  openingBalanceCents?: number;
  closingDay?: number | null;
  dueDay?: number | null;
  creditLimitCents?: number | null;
  archived?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;
  const body = (req.body ?? {}) as Body;
  const { walletId } = body;
  if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }
  if (!(await requireMember(db, res, walletId, user.id))) return;

  if (req.method === 'POST') {
    if (!body.name || !body.kind) { res.status(400).json({ error: 'invalid_account' }); return; }
    const isCard = body.kind === 'card';
    const { error } = await db.from('accounts').insert({
      wallet_id: walletId, name: body.name, kind: body.kind,
      opening_balance_cents: body.openingBalanceCents ?? 0,
      closing_day: isCard ? body.closingDay ?? null : null,
      due_day: isCard ? body.dueDay ?? null : null,
      credit_limit_cents: isCard ? body.creditLimitCents ?? null : null,
    });
    if (error) { res.status(400).json({ error: 'insert_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'PATCH') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'accounts', body.id, walletId))) return;
    const row: Record<string, unknown> = {};
    if (body.name !== undefined) row.name = body.name;
    if (body.openingBalanceCents !== undefined) row.opening_balance_cents = body.openingBalanceCents;
    if (body.closingDay !== undefined) row.closing_day = body.closingDay;
    if (body.dueDay !== undefined) row.due_day = body.dueDay;
    if (body.creditLimitCents !== undefined) row.credit_limit_cents = body.creditLimitCents;
    if (body.archived !== undefined) row.archived = body.archived;
    const { error } = await db.from('accounts').update(row).eq('id', body.id);
    if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'accounts', body.id, walletId))) return;
    const { count, error: cntErr } = await db.from('transactions')
      .select('id', { count: 'exact', head: true }).eq('account_id', body.id);
    if (cntErr) { res.status(500).json({ error: 'db_error', detail: cntErr.message }); return; }
    if ((count ?? 0) > 0) {
      res.status(400).json({ error: 'delete_failed', detail: `Essa conta tem ${count} lançamento(s). Arquive-a em vez de excluir.` });
      return;
    }
    const { error } = await db.from('accounts').delete().eq('id', body.id);
    if (error) { res.status(400).json({ error: 'delete_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
