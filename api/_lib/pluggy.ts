// Cliente mínimo da API da Pluggy (Open Finance), só leitura.
// Plano pessoal (Meu Pluggy): os items são criados à mão no Dashboard da
// Pluggy (Demo → Conectar Conta → MeuPluggy) e o itemId é colado no app.
// Docs: https://docs.pluggy.ai — auth em POST /auth, apiKey vale 2h.
import { env } from './env.js';

const BASE = 'https://api.pluggy.ai';
// renova com folga: a apiKey dura 2h, a gente troca depois de 1h50
const KEY_TTL_MS = 110 * 60 * 1000;

let cached: { key: string; exp: number } | null = null;

export class PluggyError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'PluggyError'; }
}

export function pluggyConfigured(): boolean {
  return !!(env.pluggyClientId() && env.pluggyClientSecret());
}

async function apiKey(force = false): Promise<string> {
  if (!force && cached && Date.now() < cached.exp) return cached.key;
  const clientId = env.pluggyClientId();
  const clientSecret = env.pluggyClientSecret();
  if (!clientId || !clientSecret) throw new PluggyError(503, 'Pluggy não configurada (PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET).');
  const res = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) throw new PluggyError(502, `Falha ao autenticar na Pluggy (${res.status}).`);
  const body = (await res.json()) as { apiKey?: string };
  if (!body.apiKey) throw new PluggyError(502, 'Pluggy não devolveu apiKey.');
  cached = { key: body.apiKey, exp: Date.now() + KEY_TTL_MS };
  return body.apiKey;
}

async function get<T>(path: string): Promise<T> {
  let res = await fetch(`${BASE}${path}`, { headers: { 'X-API-KEY': await apiKey() } });
  // apiKey expirada antes do previsto (ou secret trocado): tenta uma vez com uma nova
  if (res.status === 401 || res.status === 403) {
    res = await fetch(`${BASE}${path}`, { headers: { 'X-API-KEY': await apiKey(true) } });
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { const b = (await res.json()) as { message?: string }; detail = b.message ?? detail; } catch { /* ignora */ }
    throw new PluggyError(res.status === 404 ? 404 : 502, `Pluggy ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

// --- tipos (só os campos que a gente usa) ------------------------------------

export interface PluggyItem {
  id: string;
  status: string;            // UPDATED | UPDATING | LOGIN_ERROR | OUTDATED | WAITING_USER_INPUT
  executionStatus?: string;
  lastUpdatedAt?: string | null;
  consentExpiresAt?: string | null;
  connector?: { id: number; name: string };
  error?: { code?: string; message?: string } | null;
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: 'BANK' | 'CREDIT';
  subtype?: string;          // CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  name: string;
  marketingName?: string | null;
  number?: string | null;
  /** conta: saldo; cartão: limite usado */
  balance: number;
  currencyCode?: string;
  creditData?: {
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    balanceDueDate?: string | null;
  } | null;
}

export const getItem = (itemId: string): Promise<PluggyItem> =>
  get<PluggyItem>(`/items/${encodeURIComponent(itemId)}`);

export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const r = await get<{ results?: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  return r.results ?? [];
}

/** Reais (float da Pluggy) → centavos inteiros. */
export const pluggyCents = (v: number | null | undefined): number | null =>
  v == null || Number.isNaN(v) ? null : Math.round(v * 100);
