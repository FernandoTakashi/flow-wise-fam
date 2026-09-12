// Helpers de vínculo de chat e do passo de confirmação (chat_pending).
import { admin } from './supabaseAdmin.js';

export interface ChatLink {
  id: string;
  provider: string;
  external_id: string;
  user_id: string;
  wallet_id: string;
}

const PENDING_TTL_MS = 60 * 60 * 1000; // 1h

export async function findLink(provider: string, externalId: string): Promise<ChatLink | null> {
  const { data } = await admin().from('chat_links').select('*')
    .eq('provider', provider).eq('external_id', externalId).maybeSingle();
  return (data as ChatLink) ?? null;
}

export async function linksForWallet(walletId: string): Promise<ChatLink[]> {
  const { data } = await admin().from('chat_links').select('*').eq('wallet_id', walletId);
  return (data as ChatLink[]) ?? [];
}

/** Consome um token de onboarding e cria/atualiza o vínculo. */
export async function redeemToken(
  provider: string, externalId: string, token: string,
): Promise<{ ok: true; walletName: string; userName: string } | { ok: false; reason: string }> {
  const db = admin();
  const { data: tok, error: readErr } = await db.from('chat_link_tokens').select('*').eq('token', token).maybeSingle();
  if (readErr) {
    console.error('[redeemToken] leitura falhou:', readErr);
    return { ok: false, reason: `Erro no banco: ${readErr.message}. A migração 20260908000001 foi aplicada?` };
  }
  if (!tok) return { ok: false, reason: 'Token inválido ou já usado. Gere um novo no app.' };
  if (new Date(tok.expires_at).getTime() < Date.now()) {
    await db.from('chat_link_tokens').delete().eq('token', token);
    return { ok: false, reason: 'Token expirado. Gere um novo no app.' };
  }

  const { error } = await db.from('chat_links').upsert(
    { provider, external_id: externalId, user_id: tok.user_id, wallet_id: tok.wallet_id },
    { onConflict: 'provider,external_id' },
  );
  if (error) return { ok: false, reason: error.message };
  await db.from('chat_link_tokens').delete().eq('token', token);

  const [{ data: w }, { data: p }] = await Promise.all([
    db.from('wallets').select('name').eq('id', tok.wallet_id).maybeSingle(),
    db.from('profiles').select('name').eq('id', tok.user_id).maybeSingle(),
  ]);
  return { ok: true, walletName: w?.name ?? 'sua carteira', userName: p?.name ?? '' };
}

export interface Pending {
  id: string;
  kind: 'new_tx' | 'adjust_recurrence' | 'pay_fatura' | 'criar_fixo' | 'undo_tx' | 'complement_tx';
  payload: Record<string, unknown>;
}

export async function setPending(chatLinkId: string, kind: Pending['kind'], payload: Record<string, unknown>): Promise<string> {
  const db = admin();
  await db.from('chat_pending').delete().eq('chat_link_id', chatLinkId);
  const { data, error } = await db.from('chat_pending')
    .insert({ chat_link_id: chatLinkId, kind, payload }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function takePending(chatLinkId: string, id?: string): Promise<Pending | null> {
  const db = admin();
  let q = db.from('chat_pending').select('*').eq('chat_link_id', chatLinkId);
  if (id) q = q.eq('id', id);
  const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  await db.from('chat_pending').delete().eq('id', data.id);
  if (Date.now() - new Date(data.created_at).getTime() > PENDING_TTL_MS) return null;
  return { id: data.id, kind: data.kind, payload: data.payload ?? {} };
}

export async function clearPending(chatLinkId: string): Promise<void> {
  await admin().from('chat_pending').delete().eq('chat_link_id', chatLinkId);
}
