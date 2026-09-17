// "Dividir" — API do módulo de despesa em grupo. Um arquivo só (mesmo motivo
// de crud.ts/actions.ts: limite de 12 Serverless Functions no plano Hobby).
//
// GET  ?scope=groups              — meus grupos (autenticado)
// GET  ?scope=group&id=<id>       — dados completos de um grupo (autenticado, membro)
// GET  ?scope=invite&id=<id>      — prévia pública de um convite (SEM autenticação)
// POST/PATCH/DELETE { resource, action?, groupId?, ... } — todas as escritas
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_util.js';
import {
  loadSplitGroup, listSplitGroupsForUser, createSplitGroup, updateSplitGroup,
  removeSplitMember, renameSplitMember,
  createSplitExpense, updateSplitExpense, deleteSplitExpense,
  createSplitPayment, deleteSplitPayment,
  createSplitInvite, getSplitInvitePreview, redeemSplitInviteAsUser,
  type SplitGroupBundle,
} from '../_lib/splitFinance.js';
import { admin } from '../_lib/supabaseAdmin.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any> & { resource?: string; action?: string; groupId?: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleGet(req, res);
  return handleWrite(req, res);
}

// ---------------------------------------------------------------------------
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const scope = typeof req.query.scope === 'string' ? req.query.scope : '';
  const id = typeof req.query.id === 'string' ? req.query.id : '';

  if (scope === 'invite') {
    if (!id) { res.status(400).json({ error: 'missing_id' }); return; }
    try {
      const preview = await getSplitInvitePreview(id);
      if (!preview) { res.status(404).json({ error: 'invite_not_found' }); return; }
      res.status(200).json({ groupId: preview.groupId, groupName: preview.groupName });
    } catch (e) {
      res.status(500).json({ error: 'db_error', detail: (e as Error).message });
    }
    return;
  }

  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { user } = auth;

  if (scope === 'groups') {
    try {
      const groups = await listSplitGroupsForUser(user.id);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ groups });
    } catch (e) {
      res.status(500).json({ error: 'db_error', detail: (e as Error).message });
    }
    return;
  }

  if (scope === 'group') {
    if (!id) { res.status(400).json({ error: 'missing_id' }); return; }
    try {
      const bundle = await loadSplitGroup(id);
      if (!bundle) { res.status(404).json({ error: 'not_found' }); return; }
      if (!isActiveMember(bundle, user.id)) { res.status(403).json({ error: 'not_a_member' }); return; }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(bundle);
    } catch (e) {
      res.status(500).json({ error: 'db_error', detail: (e as Error).message });
    }
    return;
  }

  res.status(400).json({ error: 'invalid_scope' });
}

// ---------------------------------------------------------------------------
async function handleWrite(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { user } = auth;
  const body = (req.body ?? {}) as Body;
  const { resource } = body;
  if (!resource) { res.status(400).json({ error: 'missing_resource' }); return; }

  try {
    switch (resource) {
      case 'group': await handleGroup(req, res, user.id, body); return;
      case 'member': await handleMember(req, res, user.id, body); return;
      case 'expense': await handleExpense(req, res, user.id, body); return;
      case 'payment': await handlePayment(req, res, user.id, body); return;
      case 'invite': await handleInvite(req, res, user.id, body); return;
      default: res.status(400).json({ error: 'invalid_resource' });
    }
  } catch (e) {
    res.status(400).json({ error: 'operation_failed', detail: (e as Error).message });
  }
}

/** Membro ativo, checado a partir do bundle já carregado (evita outra ida ao banco). */
function isActiveMember(bundle: SplitGroupBundle, userId: string): boolean {
  return bundle.members.some((m) => m.user_id === userId && !m.left_at);
}

async function loadAndAuthorize(
  res: VercelResponse, groupId: string | undefined, userId: string,
): Promise<SplitGroupBundle | null> {
  if (!groupId) { res.status(400).json({ error: 'missing_group' }); return null; }
  const bundle = await loadSplitGroup(groupId);
  if (!bundle) { res.status(404).json({ error: 'not_found' }); return null; }
  if (!isActiveMember(bundle, userId)) { res.status(403).json({ error: 'not_a_member' }); return null; }
  return bundle;
}

/** Só quem criou o grupo (ou lançou o registro) mexe em edição/remoção sensível. */
function isOwnerOf(bundle: SplitGroupBundle, userId: string): boolean {
  return bundle.group.created_by === userId;
}

// --- group -------------------------------------------------------------
async function handleGroup(req: VercelRequest, res: VercelResponse, userId: string, body: Body) {
  if (req.method === 'POST') {
    if (!body.name) { res.status(400).json({ error: 'missing_name' }); return; }
    const id = await createSplitGroup(body.name, userId);
    res.status(200).json({ id });
    return;
  }
  if (req.method === 'PATCH') {
    const groupId: string | undefined = body.groupId;
    if (!groupId) { res.status(400).json({ error: 'missing_group' }); return; }
    const bundle = await loadAndAuthorize(res, groupId, userId);
    if (!bundle) return;
    if (!isOwnerOf(bundle, userId)) { res.status(403).json({ error: 'owner_only' }); return; }
    await updateSplitGroup(groupId, { name: body.name, archived: body.archived });
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- member --------------------------------------------------------
async function handleMember(req: VercelRequest, res: VercelResponse, userId: string, body: Body) {
  const groupId: string | undefined = body.groupId;
  if (!groupId) { res.status(400).json({ error: 'missing_group' }); return; }
  const bundle = await loadAndAuthorize(res, groupId, userId);
  if (!bundle) return;

  if (req.method === 'PATCH') {
    const memberId: string | undefined = body.memberId;
    if (!memberId) { res.status(400).json({ error: 'missing_member' }); return; }
    if (body.action === 'remove') {
      const target = bundle.members.find((m) => m.id === memberId);
      if (target?.user_id && bundle.group.created_by && target.user_id === bundle.group.created_by) {
        res.status(400).json({ error: 'operation_failed', detail: 'Quem criou o grupo não pode ser removido — arquive o grupo em vez disso.' });
        return;
      }
      await removeSplitMember(groupId, memberId);
    } else {
      if (!body.displayName) { res.status(400).json({ error: 'missing_name' }); return; }
      await renameSplitMember(groupId, memberId, body.displayName);
    }
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- expense -------------------------------------------------------
async function handleExpense(req: VercelRequest, res: VercelResponse, userId: string, body: Body) {
  const groupId: string | undefined = body.groupId;
  if (!groupId) { res.status(400).json({ error: 'missing_group' }); return; }
  const bundle = await loadAndAuthorize(res, groupId, userId);
  if (!bundle) return;

  const input = {
    description: body.description ?? '', amountCents: body.amountCents, paidBy: body.paidBy,
    dateISO: body.dateISO, participantIds: body.participantIds, exactShareCents: body.exactShareCents,
  };

  if (req.method === 'POST') {
    if (!input.amountCents || !input.paidBy || !input.dateISO) { res.status(400).json({ error: 'invalid_expense' }); return; }
    const id = await createSplitExpense(groupId, input, userId);
    res.status(200).json({ id });
    return;
  }
  if (req.method === 'PATCH') {
    const expenseId: string | undefined = body.id;
    if (!expenseId) { res.status(400).json({ error: 'missing_id' }); return; }
    const expense = bundle.expenses.find((e) => e.id === expenseId);
    if (!expense) { res.status(404).json({ error: 'not_found' }); return; }
    if (expense.created_by !== userId && !isOwnerOf(bundle, userId)) { res.status(403).json({ error: 'not_allowed' }); return; }
    await updateSplitExpense(groupId, expenseId, input);
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === 'DELETE') {
    const expenseId: string | undefined = body.id;
    if (!expenseId) { res.status(400).json({ error: 'missing_id' }); return; }
    const expense = bundle.expenses.find((e) => e.id === expenseId);
    if (!expense) { res.status(404).json({ error: 'not_found' }); return; }
    if (expense.created_by !== userId && !isOwnerOf(bundle, userId)) { res.status(403).json({ error: 'not_allowed' }); return; }
    await deleteSplitExpense(groupId, expenseId);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- payment -------------------------------------------------------
async function handlePayment(req: VercelRequest, res: VercelResponse, userId: string, body: Body) {
  const groupId: string | undefined = body.groupId;
  if (!groupId) { res.status(400).json({ error: 'missing_group' }); return; }
  const bundle = await loadAndAuthorize(res, groupId, userId);
  if (!bundle) return;

  if (req.method === 'POST') {
    if (!body.fromMember || !body.toMember || !body.amountCents || !body.dateISO) {
      res.status(400).json({ error: 'invalid_payment' }); return;
    }
    const id = await createSplitPayment(
      groupId, body.fromMember, body.toMember, body.amountCents, body.dateISO, body.note ?? null, userId,
    );
    res.status(200).json({ id });
    return;
  }
  if (req.method === 'DELETE') {
    const paymentId: string | undefined = body.id;
    if (!paymentId) { res.status(400).json({ error: 'missing_id' }); return; }
    const payment = bundle.payments.find((p) => p.id === paymentId);
    if (!payment) { res.status(404).json({ error: 'not_found' }); return; }
    if (payment.created_by !== userId && !isOwnerOf(bundle, userId)) { res.status(403).json({ error: 'not_allowed' }); return; }
    await deleteSplitPayment(groupId, paymentId);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
}

// --- invite --------------------------------------------------------
async function handleInvite(req: VercelRequest, res: VercelResponse, userId: string, body: Body) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  if (body.action === 'create') {
    const groupId: string | undefined = body.groupId;
    if (!groupId) { res.status(400).json({ error: 'missing_group' }); return; }
    const bundle = await loadAndAuthorize(res, groupId, userId);
    if (!bundle) return;
    const id = await createSplitInvite(groupId, userId);
    res.status(200).json({ id });
    return;
  }

  if (body.action === 'redeem') {
    const inviteId: string | undefined = body.inviteId;
    if (!inviteId) { res.status(400).json({ error: 'missing_invite' }); return; }
    // pega o nome do perfil como sugestão de display_name se não vier um
    let displayName = body.displayName as string | undefined;
    if (!displayName) {
      const { data: profile } = await admin().from('profiles').select('name').eq('id', userId).maybeSingle();
      displayName = profile?.name || 'Convidado';
    }
    const groupId = await redeemSplitInviteAsUser(inviteId, userId, displayName ?? 'Convidado');
    res.status(200).json({ groupId });
    return;
  }

  res.status(400).json({ error: 'invalid_action' });
}
