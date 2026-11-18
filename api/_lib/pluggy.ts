// Cliente mínimo da API da Pluggy (Open Finance), só leitura.
// Plano pessoal (Meu Pluggy): os items são criados à mão no Dashboard da
// Pluggy (Demo → Conectar Conta → MeuPluggy) e o itemId é colado no app.
// Docs: https://docs.pluggy.ai — auth em POST /auth, apiKey vale 2h.
import { env } from './env.js';

const BASE = 'https://api.pluggy.ai';
// renova com folga: a apiKey dura 2h, a gente troca depois de 1h50
const KEY_TTL_MS = 110 * 60 * 1000;

/** Credencial de uma aplicação da Pluggy (cada titular tem a sua no plano pessoal). */
export interface PluggyCreds { clientId: string; clientSecret: string }

// apiKey por clientId — cada credencial tem a sua
const cached = new Map<string, { key: string; exp: number }>();

export class PluggyError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'PluggyError'; }
}

/** Credencial do servidor (env) — a de quem configurou o app. */
export function serverCreds(): PluggyCreds | null {
  const clientId = env.pluggyClientId();
  const clientSecret = env.pluggyClientSecret();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function pluggyConfigured(): boolean {
  return serverCreds() != null;
}

async function apiKey(creds: PluggyCreds, force = false): Promise<string> {
  const hit = cached.get(creds.clientId);
  if (!force && hit && Date.now() < hit.exp) return hit.key;
  const res = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: creds.clientId, clientSecret: creds.clientSecret }),
  });
  if (res.status === 401 || res.status === 403 || res.status === 400) {
    throw new PluggyError(400, 'A Pluggy recusou o Client ID/Secret — confira no Dashboard da Pluggy.');
  }
  if (!res.ok) throw new PluggyError(502, `Falha ao autenticar na Pluggy (${res.status}).`);
  const body = (await res.json()) as { apiKey?: string };
  if (!body.apiKey) throw new PluggyError(502, 'Pluggy não devolveu apiKey.');
  cached.set(creds.clientId, { key: body.apiKey, exp: Date.now() + KEY_TTL_MS });
  return body.apiKey;
}

/** Só valida a credencial (POST /auth). */
export async function checkCreds(creds: PluggyCreds): Promise<void> {
  await apiKey(creds, true);
}

async function get<T>(creds: PluggyCreds, path: string): Promise<T> {
  let res = await fetch(`${BASE}${path}`, { headers: { 'X-API-KEY': await apiKey(creds) } });
  // apiKey expirada antes do previsto (ou secret trocado): tenta uma vez com uma nova
  if (res.status === 401 || res.status === 403) {
    res = await fetch(`${BASE}${path}`, { headers: { 'X-API-KEY': await apiKey(creds, true) } });
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

export const getItem = (creds: PluggyCreds, itemId: string): Promise<PluggyItem> =>
  get<PluggyItem>(creds, `/items/${encodeURIComponent(itemId)}`);

export async function listAccounts(creds: PluggyCreds, itemId: string): Promise<PluggyAccount[]> {
  const r = await get<{ results?: PluggyAccount[] }>(creds, `/accounts?itemId=${encodeURIComponent(itemId)}`);
  return r.results ?? [];
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  /** ISO em UTC — converter pra data de São Paulo */
  date: string;
  description: string;
  descriptionRaw?: string | null;
  /** conta: negativo = saída; cartão: positivo = compra, negativo = pagamento/estorno */
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  status: 'POSTED' | 'PENDING';
  category?: string | null;
  categoryId?: string | null;
  operationType?: string | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    purchaseDate?: string | null;
    billId?: string | null;
    /** YYYY-MM — mês de vencimento da fatura em que cai */
    billForecastDate?: string | null;
  } | null;
}

/** Todos os lançamentos da conta desde `dateFrom` (yyyy-mm-dd), seguindo o cursor do /v2. */
export async function listTransactions(creds: PluggyCreds, accountId: string, dateFrom: string): Promise<PluggyTransaction[]> {
  const out: PluggyTransaction[] = [];
  let path: string | null = `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}`;
  for (let page = 0; path && page < 50; page += 1) {
    const r: { results?: PluggyTransaction[]; next?: string | null } = await get(creds, path);
    out.push(...(r.results ?? []));
    // `next` vem pronto (query string) — anexa ao caminho como veio
    if (!r.next) path = null;
    else if (r.next.startsWith('http')) path = new URL(r.next).pathname + new URL(r.next).search;
    else if (r.next.startsWith('/')) path = r.next;
    else path = `/v2/transactions${r.next.startsWith('?') ? r.next : `?${r.next}`}`;
  }
  return out;
}

/** Reais (float da Pluggy) → centavos inteiros. */
export const pluggyCents = (v: number | null | undefined): number | null =>
  v == null || Number.isNaN(v) ? null : Math.round(v * 100);
