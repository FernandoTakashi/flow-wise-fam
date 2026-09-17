// Pendência de confirmação do bot num grupo do "Dividir" — POR PESSOA dentro
// do grupo (group_id + telegram_user_id), não por chat inteiro. Diferente de
// chat_pending (1 pessoa por chat privado): num grupo, várias pessoas podem
// estar confirmando coisas ao mesmo tempo.
import { admin } from './supabaseAdmin.js';

export interface SplitPending {
  id: string;
  groupId: string;
  telegramUserId: number;
  kind: 'despesa' | 'acerto';
  payload: Record<string, unknown>;
}

export async function setSplitPending(
  groupId: string, telegramUserId: number, kind: SplitPending['kind'], payload: Record<string, unknown>,
): Promise<string> {
  const db = admin();
  await db.from('split_pending').delete().eq('group_id', groupId).eq('telegram_user_id', telegramUserId);
  const { data, error } = await db.from('split_pending')
    .insert({ group_id: groupId, telegram_user_id: telegramUserId, kind, payload })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}

/** Consome a pendência pelo id do próprio card de confirmação. */
export async function takeSplitPending(id: string): Promise<SplitPending | null> {
  const db = admin();
  const { data } = await db.from('split_pending').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  await db.from('split_pending').delete().eq('id', id);
  return {
    id: data.id, groupId: data.group_id, telegramUserId: data.telegram_user_id,
    kind: data.kind, payload: data.payload ?? {},
  };
}

/** Lê sem consumir — pro editor de participantes, que mexe no payload várias vezes antes do confirmar de verdade. */
export async function peekSplitPending(id: string): Promise<SplitPending | null> {
  const db = admin();
  const { data } = await db.from('split_pending').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  return {
    id: data.id, groupId: data.group_id, telegramUserId: data.telegram_user_id,
    kind: data.kind, payload: data.payload ?? {},
  };
}

/** Atualiza o payload em cima da MESMA linha (mesmo id) — os botões da mensagem já enviada continuam válidos. */
export async function updateSplitPendingPayload(id: string, payload: Record<string, unknown>): Promise<void> {
  const db = admin();
  const { error } = await db.from('split_pending').update({ payload }).eq('id', id);
  if (error) throw error;
}
