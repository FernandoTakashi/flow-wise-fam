// Boilerplate comum dos endpoints /api/v1: autenticação pelo Bearer token do
// Supabase Auth + checagem de membro/dono da carteira.
import type { VercelResponse } from '@vercel/node';
import { type SupabaseClient, type User } from '@supabase/supabase-js';
import { admin } from '../_lib/supabaseAdmin.js';

export interface Authed { db: SupabaseClient; user: User }

/** Extrai e valida o Bearer token. Já responde 401 e devolve null se inválido. */
export async function requireUser(authHeader: string | undefined, res: VercelResponse): Promise<Authed | null> {
  const token = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { res.status(401).json({ error: 'missing_token' }); return null; }
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) { res.status(401).json({ error: 'invalid_token' }); return null; }
  return { db, user: data.user };
}

/**
 * Confere que o usuário é membro (ou dono, se `requireOwner`) da carteira.
 * Já responde 403/500 e devolve null se não for.
 */
export async function requireMember(
  db: SupabaseClient, res: VercelResponse, walletId: string, userId: string, requireOwner = false,
): Promise<string | null> {
  const { data, error } = await db
    .from('wallet_members').select('role')
    .eq('wallet_id', walletId).eq('user_id', userId).maybeSingle();
  if (error) { res.status(500).json({ error: 'db_error', detail: error.message }); return null; }
  if (!data) { res.status(403).json({ error: 'not_a_member' }); return null; }
  if (requireOwner && data.role !== 'owner') { res.status(403).json({ error: 'owner_only' }); return null; }
  return data.role as string;
}

/** Dono do lançamento/registro está na carteira do usuário? Consulta genérica de posse. */
export async function requireRowInWallet(
  db: SupabaseClient, res: VercelResponse, table: string, id: string, walletId: string,
): Promise<boolean> {
  const { data, error } = await db.from(table).select('id').eq('id', id).eq('wallet_id', walletId).maybeSingle();
  if (error) { res.status(500).json({ error: 'db_error', detail: error.message }); return false; }
  if (!data) { res.status(404).json({ error: 'not_found' }); return false; }
  return true;
}

export function fail(res: VercelResponse, e: unknown, status = 400): void {
  res.status(status).json({ error: 'operation_failed', detail: (e as Error).message });
}
