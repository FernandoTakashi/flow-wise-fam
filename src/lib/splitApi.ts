// "Dividir" — chamadas e mapeamento de linha (snake_case do banco) pra tipo
// do domínio (camelCase). Fica fora do FinanceContext de propósito.
import { apiFetch, apiFetchPublic } from '@/lib/api';
import type { SplitGroupDetail, SplitGroupSummary } from '@/types/split';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapMember = (r: any) => ({
  id: r.id, groupId: r.group_id, userId: r.user_id, telegramUserId: r.telegram_user_id,
  displayName: r.display_name, leftAt: r.left_at,
});
const mapExpense = (r: any) => ({
  id: r.id, groupId: r.group_id, description: r.description, amountCents: Number(r.amount_cents),
  paidBy: r.paid_by, date: r.date, createdBy: r.created_by, createdAt: r.created_at,
});
const mapShare = (r: any) => ({
  id: r.id, expenseId: r.expense_id, memberId: r.member_id, shareCents: Number(r.share_cents),
});
const mapPayment = (r: any) => ({
  id: r.id, groupId: r.group_id, fromMember: r.from_member, toMember: r.to_member,
  amountCents: Number(r.amount_cents), date: r.date, note: r.note, createdBy: r.created_by, createdAt: r.created_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchSplitGroups(): Promise<SplitGroupSummary[]> {
  const r = await apiFetch<{ groups: SplitGroupSummary[] }>('/split?scope=groups');
  return r.groups;
}

export async function fetchSplitGroup(id: string): Promise<SplitGroupDetail> {
  const r = await apiFetch<{
    group: { id: string; name: string; archived: boolean; created_by: string | null };
    members: unknown[]; expenses: unknown[]; shares: unknown[]; payments: unknown[];
  }>(`/split?scope=group&id=${encodeURIComponent(id)}`);
  return {
    group: { id: r.group.id, name: r.group.name, archived: r.group.archived, createdBy: r.group.created_by },
    members: r.members.map(mapMember),
    expenses: r.expenses.map(mapExpense),
    shares: r.shares.map(mapShare),
    payments: r.payments.map(mapPayment),
  };
}

export async function fetchInvitePreview(inviteId: string): Promise<{ groupName: string } | null> {
  try {
    return await apiFetchPublic<{ groupName: string }>(`/split?scope=invite&id=${encodeURIComponent(inviteId)}`);
  } catch {
    return null;
  }
}

export async function createSplitGroup(name: string): Promise<string> {
  const r = await apiFetch<{ id: string }>('/split', { method: 'POST', body: JSON.stringify({ resource: 'group', name }) });
  return r.id;
}

export async function renameSplitGroup(groupId: string, name: string): Promise<void> {
  await apiFetch('/split', { method: 'PATCH', body: JSON.stringify({ resource: 'group', groupId, name }) });
}

export async function archiveSplitGroup(groupId: string, archived: boolean): Promise<void> {
  await apiFetch('/split', { method: 'PATCH', body: JSON.stringify({ resource: 'group', groupId, archived }) });
}

export async function removeSplitMember(groupId: string, memberId: string): Promise<void> {
  await apiFetch('/split', { method: 'PATCH', body: JSON.stringify({ resource: 'member', action: 'remove', groupId, memberId }) });
}

export async function renameSplitMember(groupId: string, memberId: string, displayName: string): Promise<void> {
  await apiFetch('/split', { method: 'PATCH', body: JSON.stringify({ resource: 'member', groupId, memberId, displayName }) });
}

export interface ExpenseFormInput {
  description: string;
  amountCents: number;
  paidBy: string;
  dateISO: string;
  participantIds?: string[];
  exactShareCents?: Record<string, number>;
}

export async function createSplitExpense(groupId: string, input: ExpenseFormInput): Promise<void> {
  await apiFetch('/split', { method: 'POST', body: JSON.stringify({ resource: 'expense', groupId, ...input }) });
}

export async function updateSplitExpense(groupId: string, id: string, input: ExpenseFormInput): Promise<void> {
  await apiFetch('/split', { method: 'PATCH', body: JSON.stringify({ resource: 'expense', groupId, id, ...input }) });
}

export async function deleteSplitExpense(groupId: string, id: string): Promise<void> {
  await apiFetch('/split', { method: 'DELETE', body: JSON.stringify({ resource: 'expense', groupId, id }) });
}

export async function createSplitPayment(
  groupId: string, fromMember: string, toMember: string, amountCents: number, dateISO: string, note?: string,
): Promise<void> {
  await apiFetch('/split', {
    method: 'POST',
    body: JSON.stringify({ resource: 'payment', groupId, fromMember, toMember, amountCents, dateISO, note: note ?? null }),
  });
}

export async function deleteSplitPayment(groupId: string, id: string): Promise<void> {
  await apiFetch('/split', { method: 'DELETE', body: JSON.stringify({ resource: 'payment', groupId, id }) });
}

export async function createSplitInvite(groupId: string): Promise<string> {
  const r = await apiFetch<{ id: string }>('/split', { method: 'POST', body: JSON.stringify({ resource: 'invite', action: 'create', groupId }) });
  return r.id;
}

export async function redeemSplitInvite(inviteId: string, displayName?: string): Promise<string> {
  const r = await apiFetch<{ groupId: string }>('/split', {
    method: 'POST', body: JSON.stringify({ resource: 'invite', action: 'redeem', inviteId, displayName }),
  });
  return r.groupId;
}
