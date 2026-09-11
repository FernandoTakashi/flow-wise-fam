// POST/PATCH/DELETE /api/v1/crud   body: { resource, walletId, ... }
// resource: 'transaction' | 'recurrence' | 'account' | 'category' | 'investment'
//         | 'wallet' | 'member' | 'settings'
//
// Um único endpoint pro CRUD de todos os recursos da carteira — o plano
// Hobby da Vercel limita a 12 Serverless Functions por deployment, então em
// vez de um arquivo por recurso, despachamos pelo campo `resource`.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  loadWalletBundle, insertEntry, updateEntry, deleteEntry, createRecurrence,
  type EntryInput, type EntryPatch,
} from '../_lib/finance.js';
import { requireMember, requireRowInWallet, requireUser } from './_util.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any> & { resource?: string; walletId?: string; id?: string };

const OWNER_ONLY = new Set(['wallet', 'member']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;

  const body = (req.body ?? {}) as Body;
  const { resource, walletId } = body;
  if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }
  if (!resource) { res.status(400).json({ error: 'missing_resource' }); return; }
  if (!(await requireMember(db, res, walletId, user.id, OWNER_ONLY.has(resource)))) return;

  try {
    switch (resource) {
      case 'transaction': await transaction(req, res, walletId, user.id, body); return;
      case 'recurrence': await recurrence(req, res, db, walletId, body); return;
      case 'account': await account(req, res, db, walletId, body); return;
      case 'category': await category(req, res, db, walletId, body); return;
      case 'investment': await investment(req, res, db, walletId, body); return;
      case 'wallet': await wallet(req, res, db, user.id, walletId, body); return;
      case 'member': await member(req, res, db, user.id, walletId, body); return;
      case 'settings': await settings(req, res, db, walletId, body); return;
      default: res.status(400).json({ error: 'invalid_resource' });
    }
  } catch (e) {
    res.status(400).json({ error: 'operation_failed', detail: (e as Error).message });
  }
}

// --- transaction -----------------------------------------------------------
async function transaction(req: VercelRequest, res: VercelResponse, walletId: string, userId: string, body: Body) {
  if (req.method === 'POST') {
    if (!body.kind || !body.accountId || !body.amountCents || body.amountCents <= 0 || !body.dateISO) {
      res.status(400).json({ error: 'invalid_entry' }); return;
    }
    const bundle = await loadWalletBundle(walletId);
    const entry: EntryInput = {
      kind: body.kind, description: body.description ?? '', amountCents: body.amountCents,
      accountId: body.accountId, categoryId: body.categoryId ?? null, dateISO: body.dateISO,
      note: body.note ?? null, installments: body.installments ?? null,
      installmentStart: body.installmentStart ?? null, shared: body.shared ?? null,
      memberId: body.memberId ?? null, status: body.status ?? 'cleared',
      refMonth: body.refMonth ?? null, refYear: body.refYear ?? null,
    };
    const result = await insertEntry(bundle, walletId, userId, entry, 'app');
    res.status(200).json(result);
    return;
  }
  if (req.method === 'PATCH') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    const bundle = await loadWalletBundle(walletId);
    const { resource: _r, walletId: _w, id, ...patch } = body;
    await updateEntry(bundle, walletId, id, patch as EntryPatch);
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'DELETE') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    await deleteEntry(walletId, body.id);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- recurrence --------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recurrence(req: VercelRequest, res: VercelResponse, db: any, walletId: string, body: Body) {
  if (req.method === 'POST') {
    if (!body.description || !body.kind || !body.amountCents || !body.day || !body.startDate) {
      res.status(400).json({ error: 'invalid_recurrence' }); return;
    }
    try {
      await createRecurrence(walletId, {
        description: body.description, kind: body.kind, amountCents: body.amountCents,
        categoryId: body.categoryId ?? null, accountId: body.accountId ?? null, day: body.day,
        startDate: body.startDate, endDate: body.endDate ?? null,
        autopay: body.autopay ?? false, variableAmount: body.variableAmount ?? false, shared: body.shared ?? false,
        installmentsTotal: body.installmentsTotal ?? null, installmentsDone: body.installmentsDone ?? 0,
      });
    } catch (e) {
      res.status(400).json({ error: 'insert_failed', detail: (e as Error).message }); return;
    }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'PATCH') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'recurrences', body.id, walletId))) return;
    const row: Record<string, unknown> = {};
    if (body.description !== undefined) row.description = body.description;
    if (body.amountCents !== undefined) row.amount_cents = body.amountCents;
    if (body.categoryId !== undefined) row.category_id = body.categoryId;
    if (body.accountId !== undefined) row.account_id = body.accountId;
    if (body.day !== undefined) row.day = body.day;
    if (body.startDate !== undefined) row.start_date = body.startDate;
    if (body.endDate !== undefined) row.end_date = body.endDate;
    if (body.autopay !== undefined) row.autopay = body.autopay;
    if (body.variableAmount !== undefined) row.variable_amount = body.variableAmount;
    if (body.shared !== undefined) row.shared = body.shared;
    if (body.installmentsTotal !== undefined) row.installments_total = body.installmentsTotal;
    if (body.installmentsDone !== undefined) row.installments_done = body.installmentsDone;
    if (body.active !== undefined) row.active = body.active;
    const { error } = await db.from('recurrences').update(row).eq('id', body.id);
    if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'DELETE') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'recurrences', body.id, walletId))) return;
    const { error: uErr } = await db.from('transactions')
      .update({ recurrence_id: null, occ_month: null, occ_year: null }).eq('recurrence_id', body.id);
    if (uErr) { res.status(400).json({ error: 'delete_failed', detail: uErr.message }); return; }
    const { error } = await db.from('recurrences').delete().eq('id', body.id);
    if (error) { res.status(400).json({ error: 'delete_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- account -----------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function account(req: VercelRequest, res: VercelResponse, db: any, walletId: string, body: Body) {
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

// --- category ----------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function category(req: VercelRequest, res: VercelResponse, db: any, walletId: string, body: Body) {
  if (req.method === 'POST') {
    if (!body.name || !body.kind) { res.status(400).json({ error: 'invalid_category' }); return; }
    const { error } = await db.from('categories').insert({
      wallet_id: walletId, name: body.name, kind: body.kind, icon: body.icon ?? null, color: body.color ?? null,
    });
    if (error) { res.status(400).json({ error: 'insert_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'PATCH') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'categories', body.id, walletId))) return;
    const row: Record<string, unknown> = {};
    if (body.name !== undefined) row.name = body.name;
    if (body.icon !== undefined) row.icon = body.icon;
    if (body.color !== undefined) row.color = body.color;
    if (body.archived !== undefined) row.archived = body.archived;
    const { error } = await db.from('categories').update(row).eq('id', body.id);
    if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'DELETE') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'categories', body.id, walletId))) return;
    const { count, error: cntErr } = await db.from('transactions')
      .select('id', { count: 'exact', head: true }).eq('category_id', body.id);
    if (cntErr) { res.status(500).json({ error: 'db_error', detail: cntErr.message }); return; }
    const { error } = (count ?? 0) > 0
      ? await db.from('categories').update({ archived: true }).eq('id', body.id)
      : await db.from('categories').delete().eq('id', body.id);
    if (error) { res.status(400).json({ error: 'delete_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- investment --------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function investment(req: VercelRequest, res: VercelResponse, db: any, walletId: string, body: Body) {
  if (req.method === 'POST') {
    if (!body.description || !body.amountCents || !body.dateISO) { res.status(400).json({ error: 'invalid_investment' }); return; }
    const { error } = await db.from('investments').insert({
      wallet_id: walletId, description: body.description, amount_cents: body.amountCents,
      yield_rate_bps: body.yieldRateBps ?? 0, date: body.dateISO, member_id: body.memberId ?? null,
    });
    if (error) { res.status(400).json({ error: 'insert_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'PATCH') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'investments', body.id, walletId))) return;
    const row: Record<string, unknown> = {};
    if (body.description !== undefined) row.description = body.description;
    if (body.amountCents !== undefined) row.amount_cents = body.amountCents;
    if (body.yieldRateBps !== undefined) row.yield_rate_bps = body.yieldRateBps;
    if (body.dateISO !== undefined) row.date = body.dateISO;
    if (body.memberId !== undefined) row.member_id = body.memberId;
    const { error } = await db.from('investments').update(row).eq('id', body.id);
    if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'DELETE') {
    if (!body.id) { res.status(400).json({ error: 'missing_id' }); return; }
    if (!(await requireRowInWallet(db, res, 'investments', body.id, walletId))) return;
    const { error } = await db.from('investments').delete().eq('id', body.id);
    if (error) { res.status(400).json({ error: 'delete_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- wallet (renomear/excluir; criar continua via RPC create_wallet) ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function wallet(req: VercelRequest, res: VercelResponse, db: any, userId: string, walletId: string, body: Body) {
  if (req.method === 'PATCH') {
    if (!body.name) { res.status(400).json({ error: 'missing_fields' }); return; }
    const { error } = await db.from('wallets').update({ name: body.name }).eq('id', walletId);
    if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'DELETE') {
    const { count } = await db.from('wallet_members').select('wallet_id', { count: 'exact', head: true }).eq('user_id', userId);
    if ((count ?? 0) <= 1) { res.status(400).json({ error: 'operation_failed', detail: 'Você precisa manter ao menos uma carteira.' }); return; }
    const { error } = await db.from('wallets').delete().eq('id', walletId);
    if (error) { res.status(400).json({ error: 'delete_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- member --------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function member(req: VercelRequest, res: VercelResponse, db: any, userId: string, walletId: string, body: Body) {
  if (req.method === 'POST') {
    const email = (body.email as string | undefined)?.trim();
    if (!email) { res.status(400).json({ error: 'missing_email' }); return; }
    const { data: uid, error } = await db.rpc('find_user_id_by_email', { p_email: email });
    if (error) {
      const missingFn = error.code === 'PGRST202' || /function .*find_user_id_by_email/i.test(error.message);
      res.status(400).json({
        error: 'operation_failed',
        detail: missingFn ? 'Falta aplicar a migração 20260908000005 no Supabase.' : error.message,
      });
      return;
    }
    if (!uid) {
      res.status(400).json({
        error: 'operation_failed',
        detail: `Nenhuma conta encontrada para "${email}". Confira o e-mail (Supabase → Authentication → Users) — precisa ser o mesmo do cadastro.`,
      });
      return;
    }
    const { error: mErr } = await db.from('wallet_members').insert({ wallet_id: walletId, user_id: uid, role: 'member' });
    if (mErr) {
      res.status(400).json({
        error: 'operation_failed',
        detail: mErr.code === '23505' ? 'Essa pessoa já é membro desta carteira.' : mErr.message,
      });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'DELETE') {
    const targetUserId = body.userId as string | undefined;
    if (!targetUserId) { res.status(400).json({ error: 'missing_user' }); return; }
    if (targetUserId === userId) { res.status(400).json({ error: 'operation_failed', detail: 'Use "sair da carteira" para remover a si mesmo.' }); return; }
    const { error } = await db.from('wallet_members').delete().eq('wallet_id', walletId).eq('user_id', targetUserId);
    if (error) { res.status(400).json({ error: 'operation_failed', detail: error.message }); return; }
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- settings ------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settings(req: VercelRequest, res: VercelResponse, db: any, walletId: string, body: Body) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.initialInvestmentCents !== undefined) row.initial_investment_cents = body.initialInvestmentCents;
  if (body.defaultYieldBps !== undefined) row.default_yield_bps = body.defaultYieldBps;
  const { error } = await db.from('wallet_settings').update(row).eq('wallet_id', walletId);
  if (error) { res.status(400).json({ error: 'update_failed', detail: error.message }); return; }
  res.status(200).json({ ok: true });
}
