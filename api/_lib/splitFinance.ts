// "Dividir" — leitura/escrita do domínio de despesa em grupo. Import zero de
// finance.ts: nenhuma função daqui sabe o que é uma wallet, uma conta ou uma
// categoria — é um domínio à parte de propósito.
import { admin } from './supabaseAdmin.js';
import { splitInstallments } from './shared.js';

export interface SplitGroupRow { id: string; name: string; created_by: string | null; archived: boolean; created_at: string }
export interface SplitMemberRow {
  id: string; group_id: string; user_id: string | null; telegram_user_id: number | null;
  display_name: string; left_at: string | null;
}
export interface SplitExpenseRow {
  id: string; group_id: string; description: string; amount_cents: number;
  paid_by: string; date: string; created_by: string | null; created_at: string;
}
export interface SplitShareRow { id: string; expense_id: string; member_id: string; share_cents: number }
export interface SplitPaymentRow {
  id: string; group_id: string; from_member: string; to_member: string;
  amount_cents: number; date: string; note: string | null; created_by: string | null;
}

export interface SplitGroupBundle {
  group: SplitGroupRow;
  members: SplitMemberRow[];
  expenses: SplitExpenseRow[];
  shares: SplitShareRow[];
  payments: SplitPaymentRow[];
}

export async function loadSplitGroup(groupId: string): Promise<SplitGroupBundle | null> {
  const db = admin();
  const { data: group, error: gErr } = await db.from('split_groups').select('*').eq('id', groupId).maybeSingle();
  if (gErr) throw gErr;
  if (!group) return null;

  const [mems, exps, pays] = await Promise.all([
    db.from('split_members').select('*').eq('group_id', groupId),
    db.from('split_expenses').select('*').eq('group_id', groupId).order('date', { ascending: false }),
    db.from('split_payments').select('*').eq('group_id', groupId).order('date', { ascending: false }),
  ]);
  if (mems.error) throw mems.error;
  if (exps.error) throw exps.error;
  if (pays.error) throw pays.error;

  const expenseIds = (exps.data ?? []).map((e) => e.id as string);
  let shares: SplitShareRow[] = [];
  if (expenseIds.length > 0) {
    const { data, error } = await db.from('split_shares').select('*').in('expense_id', expenseIds);
    if (error) throw error;
    shares = (data ?? []) as SplitShareRow[];
  }

  return {
    group: group as SplitGroupRow,
    members: (mems.data ?? []) as SplitMemberRow[],
    expenses: (exps.data ?? []) as SplitExpenseRow[],
    shares,
    payments: (pays.data ?? []) as SplitPaymentRow[],
  };
}

/** Grupos onde `userId` é membro ativo, com um resuminho de saldo por grupo. */
export async function listSplitGroupsForUser(userId: string): Promise<
  { id: string; name: string; archived: boolean; memberCount: number; netCents: number }[]
> {
  const db = admin();
  const { data: myMemberships, error } = await db.from('split_members')
    .select('id, group_id').eq('user_id', userId).is('left_at', null);
  if (error) throw error;
  const groupIds = [...new Set((myMemberships ?? []).map((m) => m.group_id as string))];
  if (groupIds.length === 0) return [];

  const { data: groups, error: gErr } = await db.from('split_groups').select('*').in('id', groupIds);
  if (gErr) throw gErr;

  const out = [];
  for (const g of (groups ?? []) as SplitGroupRow[]) {
    const bundle = await loadSplitGroup(g.id);
    if (!bundle) continue;
    const myMember = (myMemberships ?? []).find((m) => m.group_id === g.id);
    const balances = computeBalances(bundle);
    const mine = balances.find((b) => b.memberId === myMember?.id)?.netCents ?? 0;
    out.push({
      id: g.id, name: g.name, archived: g.archived,
      memberCount: bundle.members.filter((m) => !m.left_at).length,
      netCents: mine,
    });
  }
  return out;
}

export async function createSplitGroup(name: string, createdBy: string): Promise<string> {
  const db = admin();
  const { data, error } = await db.from('split_groups')
    .insert({ name: name.trim() || 'Novo grupo', created_by: createdBy }).select('id').single();
  if (error) throw error;
  const groupId = data.id as string;
  // quem cria já entra como o primeiro membro
  await db.from('split_members').insert({ group_id: groupId, user_id: createdBy, display_name: 'Você' });
  return groupId;
}

/**
 * `/iniciar` direto num grupo do Telegram — cria o split_group sem passar
 * pelo app. Se quem digitou já conectou o Telegram pessoal na carteira,
 * `created_by` já nasce preenchido; senão fica null (o grupo funciona
 * normalmente, só sem "dono" pro app até alguém reivindicar depois).
 */
export async function createSplitGroupFromTelegram(
  chatExternalId: string, groupName: string, creatorTelegramUserId: number, creatorDisplayName: string,
): Promise<{ groupId: string; member: SplitMemberRow }> {
  const db = admin();
  const creatorUserId = await resolveUserIdForTelegram(creatorTelegramUserId);

  const { data: group, error } = await db.from('split_groups')
    .insert({ name: groupName || 'Grupo do Telegram', created_by: creatorUserId }).select('id').single();
  if (error) throw error;
  const groupId = group.id as string;

  const { error: linkErr } = await db.from('split_chat_links')
    .insert({ provider: 'telegram', external_id: chatExternalId, group_id: groupId });
  if (linkErr) throw linkErr;

  const member = await findOrCreateTelegramMember(groupId, creatorTelegramUserId, creatorDisplayName);
  return { groupId, member };
}

export async function updateSplitGroup(groupId: string, patch: { name?: string; archived?: boolean }): Promise<void> {
  const db = admin();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.archived !== undefined) row.archived = patch.archived;
  const { error } = await db.from('split_groups').update(row).eq('id', groupId);
  if (error) throw error;
}

export async function addSplitMember(groupId: string, displayName: string): Promise<string> {
  const db = admin();
  const { data, error } = await db.from('split_members')
    .insert({ group_id: groupId, display_name: displayName.trim() || 'Sem nome' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function removeSplitMember(groupId: string, memberId: string): Promise<void> {
  const db = admin();
  const { error } = await db.from('split_members')
    .update({ left_at: new Date().toISOString() }).eq('id', memberId).eq('group_id', groupId);
  if (error) throw error;
}

export async function renameSplitMember(groupId: string, memberId: string, displayName: string): Promise<void> {
  const db = admin();
  const { error } = await db.from('split_members')
    .update({ display_name: displayName.trim() || 'Sem nome' }).eq('id', memberId).eq('group_id', groupId);
  if (error) throw error;
}

export interface ExpenseInput {
  description: string;
  amountCents: number;
  paidBy: string;
  dateISO: string;
  /** ids de split_members participando; vazio/omitido = todos os membros ativos */
  participantIds?: string[];
  /** 'equal' (default) ou valores exatos por membro */
  exactShareCents?: Record<string, number>;
}

async function resolveParticipants(groupId: string, participantIds?: string[]): Promise<string[]> {
  if (participantIds && participantIds.length > 0) return participantIds;
  const db = admin();
  const { data, error } = await db.from('split_members').select('id').eq('group_id', groupId).is('left_at', null);
  if (error) throw error;
  return (data ?? []).map((m) => m.id as string);
}

export async function createSplitExpense(groupId: string, input: ExpenseInput, createdBy: string | null): Promise<string> {
  if (input.amountCents <= 0) throw new Error('Valor precisa ser maior que zero.');
  const db = admin();
  const participants = await resolveParticipants(groupId, input.participantIds);
  if (participants.length === 0) throw new Error('Escolha ao menos um participante.');

  const shareCents = resolveShares(input.amountCents, participants, input.exactShareCents);

  const { data: expense, error } = await db.from('split_expenses').insert({
    group_id: groupId, description: input.description.trim() || 'Despesa', amount_cents: input.amountCents,
    paid_by: input.paidBy, date: input.dateISO, created_by: createdBy,
  }).select('id').single();
  if (error) throw error;

  const rows = Object.entries(shareCents).map(([memberId, cents]) => ({
    expense_id: expense.id, member_id: memberId, share_cents: cents,
  }));
  const { error: shareErr } = await db.from('split_shares').insert(rows);
  if (shareErr) throw shareErr;
  return expense.id as string;
}

export async function updateSplitExpense(groupId: string, expenseId: string, input: ExpenseInput): Promise<void> {
  if (input.amountCents <= 0) throw new Error('Valor precisa ser maior que zero.');
  const db = admin();
  const participants = await resolveParticipants(groupId, input.participantIds);
  if (participants.length === 0) throw new Error('Escolha ao menos um participante.');
  const shareCents = resolveShares(input.amountCents, participants, input.exactShareCents);

  const { error } = await db.from('split_expenses').update({
    description: input.description.trim() || 'Despesa', amount_cents: input.amountCents,
    paid_by: input.paidBy, date: input.dateISO,
  }).eq('id', expenseId).eq('group_id', groupId);
  if (error) throw error;

  await db.from('split_shares').delete().eq('expense_id', expenseId);
  const rows = Object.entries(shareCents).map(([memberId, cents]) => ({
    expense_id: expenseId, member_id: memberId, share_cents: cents,
  }));
  const { error: shareErr } = await db.from('split_shares').insert(rows);
  if (shareErr) throw shareErr;
}

export async function deleteSplitExpense(groupId: string, expenseId: string): Promise<void> {
  const db = admin();
  const { error } = await db.from('split_expenses').delete().eq('id', expenseId).eq('group_id', groupId);
  if (error) throw error;
}

function resolveShares(amountCents: number, participants: string[], exact?: Record<string, number>): Record<string, number> {
  if (exact && Object.keys(exact).length > 0) {
    const sum = Object.values(exact).reduce((s, c) => s + c, 0);
    if (sum !== amountCents) throw new Error('A soma dos valores não bate com o total da despesa.');
    return exact;
  }
  const parts = splitInstallments(amountCents, participants.length);
  const out: Record<string, number> = {};
  participants.forEach((id, i) => { out[id] = parts[i]; });
  return out;
}

export async function createSplitPayment(
  groupId: string, fromMember: string, toMember: string, amountCents: number, dateISO: string,
  note: string | null, createdBy: string | null,
): Promise<string> {
  if (amountCents <= 0) throw new Error('Valor precisa ser maior que zero.');
  if (fromMember === toMember) throw new Error('Escolha duas pessoas diferentes.');
  const db = admin();
  const { data, error } = await db.from('split_payments').insert({
    group_id: groupId, from_member: fromMember, to_member: toMember,
    amount_cents: amountCents, date: dateISO, note, created_by: createdBy,
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteSplitPayment(groupId: string, paymentId: string): Promise<void> {
  const db = admin();
  const { error } = await db.from('split_payments').delete().eq('id', paymentId).eq('group_id', groupId);
  if (error) throw error;
}

// --- convites --------------------------------------------------------------

export async function createSplitInvite(groupId: string, createdBy: string): Promise<string> {
  const db = admin();
  const { data, error } = await db.from('split_invites')
    .insert({ group_id: groupId, created_by: createdBy }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function getSplitInvitePreview(inviteId: string): Promise<{ groupId: string; groupName: string } | null> {
  const db = admin();
  const { data: invite } = await db.from('split_invites').select('group_id, revoked_at').eq('id', inviteId).maybeSingle();
  if (!invite || invite.revoked_at) return null;
  const { data: group } = await db.from('split_groups').select('name').eq('id', invite.group_id).maybeSingle();
  if (!group) return null;
  return { groupId: invite.group_id as string, groupName: group.name as string };
}

/** Alguém (conta de verdade ou visitante anônimo) entra no grupo pelo link. Idempotente. */
export async function redeemSplitInviteAsUser(inviteId: string, userId: string, displayName: string): Promise<string> {
  const preview = await getSplitInvitePreview(inviteId);
  if (!preview) throw new Error('Convite inválido ou revogado.');
  const db = admin();
  const existing = await db.from('split_members').select('id')
    .eq('group_id', preview.groupId).eq('user_id', userId).maybeSingle();
  if (existing.data) return preview.groupId;
  const { error } = await db.from('split_members')
    .insert({ group_id: preview.groupId, user_id: userId, display_name: displayName.trim() || 'Convidado' });
  if (error) throw error;
  return preview.groupId;
}

/** /conectar <token> num grupo do Telegram — liga o CHAT (não uma pessoa) a este split_group. */
export async function connectTelegramChat(inviteId: string, chatExternalId: string): Promise<string> {
  const preview = await getSplitInvitePreview(inviteId);
  if (!preview) throw new Error('Convite inválido ou revogado.');
  const db = admin();
  const { error } = await db.from('split_chat_links')
    .upsert({ provider: 'telegram', external_id: chatExternalId, group_id: preview.groupId }, { onConflict: 'provider,external_id' });
  if (error) throw error;
  return preview.groupId;
}

export async function findSplitGroupIdByTelegramChat(chatExternalId: string): Promise<string | null> {
  const db = admin();
  const { data } = await db.from('split_chat_links').select('group_id')
    .eq('provider', 'telegram').eq('external_id', chatExternalId).maybeSingle();
  return (data?.group_id as string) ?? null;
}

/** Se essa pessoa já conectou o Telegram pessoal dela na carteira, acha o user_id dela. */
export async function resolveUserIdForTelegram(telegramUserId: number): Promise<string | null> {
  const db = admin();
  const { data } = await db.from('chat_links').select('user_id')
    .eq('provider', 'telegram').eq('external_id', String(telegramUserId)).maybeSingle();
  return (data?.user_id as string) ?? null;
}

/** Acha (ou cria) o membro deste grupo correspondente a quem mandou a mensagem no Telegram. */
export async function findOrCreateTelegramMember(
  groupId: string, telegramUserId: number, displayName: string,
): Promise<SplitMemberRow> {
  const db = admin();
  const byTg = await db.from('split_members').select('*')
    .eq('group_id', groupId).eq('telegram_user_id', telegramUserId).maybeSingle();
  if (byTg.data) return byTg.data as SplitMemberRow;

  const userId = await resolveUserIdForTelegram(telegramUserId);
  if (userId) {
    const byUser = await db.from('split_members').select('*')
      .eq('group_id', groupId).eq('user_id', userId).maybeSingle();
    if (byUser.data) return byUser.data as SplitMemberRow;
  }

  const { data, error } = await db.from('split_members').insert({
    group_id: groupId,
    telegram_user_id: userId ? null : telegramUserId,
    user_id: userId,
    display_name: displayName,
  }).select('*').single();
  if (error) throw error;
  return data as SplitMemberRow;
}

// --- saldo (versão enxuta pro bot; o app calcula igual via src/core/split) -

export interface SplitBalance { memberId: string; netCents: number }

export function computeBalances(bundle: SplitGroupBundle): SplitBalance[] {
  const net: Record<string, number> = {};
  bundle.members.forEach((m) => { net[m.id] = 0; });
  for (const e of bundle.expenses) net[e.paid_by] = (net[e.paid_by] ?? 0) + e.amount_cents;
  for (const s of bundle.shares) net[s.member_id] = (net[s.member_id] ?? 0) - s.share_cents;
  for (const p of bundle.payments) {
    net[p.from_member] = (net[p.from_member] ?? 0) + p.amount_cents;
    net[p.to_member] = (net[p.to_member] ?? 0) - p.amount_cents;
  }
  return Object.entries(net).map(([memberId, netCents]) => ({ memberId, netCents }));
}

export interface SplitSettlement { fromMemberId: string; toMemberId: string; amountCents: number }

export function simplifyBalances(balances: SplitBalance[]): SplitSettlement[] {
  const bal = balances.map((b) => ({ ...b })).filter((b) => b.netCents !== 0);
  const debtors = bal.filter((b) => b.netCents < 0).sort((a, b) => a.netCents - b.netCents);
  const creditors = bal.filter((b) => b.netCents > 0).sort((a, b) => b.netCents - a.netCents);
  const out: SplitSettlement[] = [];
  let i = 0; let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(-debtors[i].netCents, creditors[j].netCents);
    if (amount > 0) out.push({ fromMemberId: debtors[i].memberId, toMemberId: creditors[j].memberId, amountCents: amount });
    debtors[i].netCents += amount;
    creditors[j].netCents -= amount;
    if (debtors[i].netCents === 0) i += 1;
    if (creditors[j].netCents === 0) j += 1;
  }
  return out;
}
