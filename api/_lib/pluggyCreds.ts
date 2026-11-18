// Credenciais da Pluggy por pessoa (tabela pluggy_credentials). O secret é
// cifrado com AES-256-GCM usando PLUGGY_CREDENTIALS_KEY (32 bytes em base64),
// que só existe no backend. Formato salvo: v1.<iv>.<tag>.<cifra>, tudo base64.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { PluggyError, serverCreds, type PluggyCreds } from './pluggy.js';

function key(): Buffer {
  const raw = env.pluggyCredentialsKey();
  if (!raw) throw new PluggyError(503, 'Falta PLUGGY_CREDENTIALS_KEY no servidor para guardar credenciais da Pluggy.');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new PluggyError(503, 'PLUGGY_CREDENTIALS_KEY precisa ter 32 bytes em base64.');
  return k;
}

export const credsKeyConfigured = (): boolean => !!env.pluggyCredentialsKey();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, enc] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Credencial da Pluggy em formato inválido.');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

/** Credencial de uma conexão: a da pessoa (credential_id) ou, sem ela, a do servidor. */
export async function credsForConnection(db: SupabaseClient, credentialId: string | null | undefined): Promise<PluggyCreds> {
  if (credentialId) {
    const r = await db.from('pluggy_credentials').select('client_id, secret_ciphertext').eq('id', credentialId).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) throw new PluggyError(400, 'A credencial da Pluggy desta conexão foi removida — cadastre de novo.');
    return { clientId: r.data.client_id as string, clientSecret: decryptSecret(r.data.secret_ciphertext as string) };
  }
  const s = serverCreds();
  if (!s) throw new PluggyError(503, 'Pluggy não configurada no servidor.');
  return s;
}

/** Credencial salva de uma pessoa (id + creds), ou null. */
export async function userCreds(db: SupabaseClient, userId: string): Promise<{ id: string; creds: PluggyCreds } | null> {
  const r = await db.from('pluggy_credentials').select('id, client_id, secret_ciphertext').eq('user_id', userId).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) return null;
  return { id: r.data.id as string, creds: { clientId: r.data.client_id as string, clientSecret: decryptSecret(r.data.secret_ciphertext as string) } };
}
