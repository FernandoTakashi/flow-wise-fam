// Open Finance (Pluggy / Meu Pluggy).
// Cada membro da carteira pode conectar os PRÓPRIOS bancos com a PRÓPRIA
// credencial da Pluggy (no plano pessoal, cada titular tem a sua aplicação).
// Quem conectou (ou o dono da carteira) gerencia a conexão e as contas dela.
//
//   GET  /api/v1/bank?wallet=<uuid>  → { serverConfigured, credsKeyConfigured, myCredentials, connections, accounts }
//   POST /api/v1/bank  { walletId, action, ... }
//     'saveCredentials'   { clientId, clientSecret }  valida na Pluggy e guarda (cifrado) a credencial de quem chama
//     'deleteCredentials'                             apaga a credencial de quem chama (sem conexões usando)
//     'connect'           { itemId }                  conecta um banco com a credencial de quem chama
//     'refresh'                                       relê status e saldos
//     'import'                                        relê e importa os lançamentos das contas com corte
//     'link'              { bankAccountId, accountId | 'new' | null }  liga (ou cria) a conta da carteira
//     'setCutoff'         { bankAccountId, importFrom | null, deleteManual? }  data de corte da conta
//     'alignBalance'      { bankAccountId }           saldo inicial p/ o app bater com o banco
//     'disconnect'        { connectionId }            remove a conexão (só aqui; o item continua na Pluggy)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncConnection } from '../_lib/bank.js';
import { importWallet } from '../_lib/bankImport.js';
import { spDateISO } from '../_lib/shared.js';
import { checkCreds, pluggyConfigured, PluggyError } from '../_lib/pluggy.js';
import { credsKeyConfigured, encryptSecret } from '../_lib/pluggyCreds.js';
import { rateLimited } from '../_lib/rateLimit.js';
import { requireMember, requireUser } from './_util.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CALLS_PLUGGY = new Set(['saveCredentials', 'connect', 'refresh', 'import']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any> & { walletId?: string; action?: string };

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req.headers.authorization, res);
  if (!auth) return;
  const { db, user } = auth;
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const walletId = typeof req.query.wallet === 'string' ? req.query.wallet : '';
      if (!walletId) { res.status(400).json({ error: 'missing_wallet' }); return; }
      if (!(await requireMember(db, res, walletId, user.id))) return;
      res.status(200).json(await listState(db, walletId, user.id));
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

    const body = (req.body ?? {}) as Body;
    const { walletId, action } = body;
    if (!walletId || !action) { res.status(400).json({ error: 'missing_fields' }); return; }
    const role = await requireMember(db, res, walletId, user.id);
    if (!role) return;
    const isOwner = role === 'owner';

    if (CALLS_PLUGGY.has(action) && rateLimited(`bank:${user.id}`, 10, 60_000)) {
      res.status(429).json({ error: 'rate_limited', detail: 'Muitas chamadas seguidas ao banco — espere um minuto.' }); return;
    }

    /** Quem conectou o banco (ou o dono da carteira) gerencia a conexão. */
    const assertCanManageConnection = async (connectionId: string) => {
      const c = await db.from('bank_connections').select('id, created_by').eq('id', connectionId).eq('wallet_id', walletId).maybeSingle();
      if (c.error) throw c.error;
      if (!c.data) throw new HttpError(404, 'not_found', 'Conexão não encontrada.');
      if (!isOwner && c.data.created_by !== user.id) {
        throw new HttpError(403, 'not_yours', 'Só quem conectou esse banco (ou o dono da carteira) pode mexer nele.');
      }
    };
    const loadBankAccount = async (bankAccountId: string) => {
      const ba = await db.from('bank_accounts')
        .select('id, connection_id, name, type, balance_cents, credit_limit_cents, due_date, account_id')
        .eq('id', bankAccountId).eq('wallet_id', walletId).maybeSingle();
      if (ba.error) throw ba.error;
      if (!ba.data) throw new HttpError(404, 'not_found', 'Conta do banco não encontrada.');
      await assertCanManageConnection(ba.data.connection_id as string);
      return ba.data;
    };

    switch (action) {
      case 'saveCredentials': {
        const clientId = String(body.clientId ?? '').trim();
        const clientSecret = String(body.clientSecret ?? '').trim();
        if (!UUID_RE.test(clientId) || clientSecret.length < 20) {
          throw new HttpError(400, 'invalid_credentials', 'Confira o Client ID (formato UUID) e o Client Secret.');
        }
        if (!credsKeyConfigured()) throw new HttpError(503, 'no_key', 'O servidor ainda não está pronto para guardar credenciais (falta PLUGGY_CREDENTIALS_KEY).');
        await checkCreds({ clientId, clientSecret });
        const up = await db.from('pluggy_credentials').upsert({
          user_id: user.id, client_id: clientId, secret_ciphertext: encryptSecret(clientSecret), updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (up.error) throw up.error;
        break;
      }
      case 'deleteCredentials': {
        const mine = await db.from('pluggy_credentials').select('id').eq('user_id', user.id).maybeSingle();
        if (mine.error) throw mine.error;
        if (mine.data) {
          const used = await db.from('bank_connections').select('id', { count: 'exact', head: true }).eq('credential_id', mine.data.id);
          if (used.error) throw used.error;
          if ((used.count ?? 0) > 0) throw new HttpError(409, 'in_use', 'Remova antes os bancos conectados com essa credencial.');
          const del = await db.from('pluggy_credentials').delete().eq('id', mine.data.id);
          if (del.error) throw del.error;
        }
        break;
      }
      case 'connect': {
        const itemId = String(body.itemId ?? '').trim();
        if (!UUID_RE.test(itemId)) throw new HttpError(400, 'invalid_item', 'O ID do item tem formato de UUID (xxxxxxxx-xxxx-…).');

        // credencial de quem conecta; a do servidor só serve pro dono (é dele)
        const mine = await db.from('pluggy_credentials').select('id').eq('user_id', user.id).maybeSingle();
        if (mine.error) throw mine.error;
        const credentialId = (mine.data?.id as string | undefined) ?? null;
        if (!credentialId && !(isOwner && pluggyConfigured())) {
          throw new HttpError(400, 'no_credentials', 'Cadastre primeiro sua credencial da Pluggy (Client ID e Secret).');
        }

        const existing = await db.from('bank_connections').select('id, wallet_id')
          .eq('provider', 'pluggy').eq('external_item_id', itemId).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data && existing.data.wallet_id !== walletId) {
          throw new HttpError(409, 'item_in_other_wallet', 'Esse banco já está conectado a outra carteira.');
        }
        let conn = existing.data;
        if (!conn) {
          const ins = await db.from('bank_connections')
            .insert({ wallet_id: walletId, provider: 'pluggy', external_item_id: itemId, created_by: user.id, credential_id: credentialId })
            .select('id, wallet_id').single();
          if (ins.error) throw ins.error;
          conn = ins.data;
        }
        try {
          await syncConnection(db, { id: conn.id, wallet_id: walletId, external_item_id: itemId, credential_id: credentialId });
        } catch (e) {
          // item inexistente/de outra credencial: não deixa uma conexão órfã pra trás
          if (!existing.data) await db.from('bank_connections').delete().eq('id', conn.id);
          throw e;
        }
        break;
      }
      case 'refresh': {
        const errors = await syncAll(db, walletId);
        if (errors.all) throw new Error(errors.first);
        break;
      }
      case 'import': {
        await syncAll(db, walletId);
        const r = await importWallet(db, walletId);
        res.status(200).json({ import: r, ...(await listState(db, walletId, user.id)) });
        return;
      }
      case 'link': {
        const ba = await loadBankAccount(String(body.bankAccountId ?? ''));
        let accountId: string | null = body.accountId ? String(body.accountId) : null;
        let importFrom: string | null | undefined;

        if (accountId === 'new') {
          // conta nova no app, espelhando a do banco: sem histórico manual, então
          // já nasce importando desde o 1º dia do mês corrente
          const isCard = ba.type === 'CREDIT';
          const dueDay = ba.due_date ? Number(String(ba.due_date).slice(8, 10)) : null;
          const closingDay = dueDay ? ((dueDay - 8 + 31) % 31) + 1 : null;  // ~7 dias antes do vencimento
          const ins = await db.from('accounts').insert({
            wallet_id: walletId, name: ba.name, kind: isCard ? 'card' : 'checking', opening_balance_cents: 0,
            closing_day: isCard ? closingDay ?? 1 : null, due_day: isCard ? dueDay ?? 10 : null,
            credit_limit_cents: isCard ? ba.credit_limit_cents ?? null : null,
          }).select('id').single();
          if (ins.error) throw ins.error;
          accountId = ins.data.id as string;
          importFrom = `${spDateISO(new Date()).slice(0, 7)}-01`;
        } else if (accountId) {
          const acc = await db.from('accounts').select('id, kind').eq('id', accountId).eq('wallet_id', walletId).maybeSingle();
          if (acc.error) throw acc.error;
          if (!acc.data) throw new HttpError(404, 'account_not_found', 'Conta da carteira não encontrada.');
          if ((acc.data.kind === 'card') !== (ba.type === 'CREDIT')) {
            throw new HttpError(400, 'kind_mismatch', 'Cartão do banco só liga a cartão da carteira (e conta só a conta).');
          }
          // uma conta da carteira só pode estar ligada a uma conta do banco
          const clear = await db.from('bank_accounts').update({ account_id: null, import_from: null })
            .eq('wallet_id', walletId).eq('account_id', accountId).neq('id', ba.id);
          if (clear.error) throw clear.error;
        }
        // trocar/desligar a conta zera o corte; conta nova já vem com corte
        if (accountId !== ba.account_id) importFrom = importFrom ?? null;
        const patch: Record<string, unknown> = { account_id: accountId };
        if (importFrom !== undefined) patch.import_from = importFrom;
        const upd = await db.from('bank_accounts').update(patch).eq('id', ba.id);
        if (upd.error) throw upd.error;
        break;
      }
      case 'setCutoff': {
        const ba = await loadBankAccount(String(body.bankAccountId ?? ''));
        if (!ba.account_id) throw new HttpError(400, 'not_linked', 'Ligue a conta do banco a uma conta da carteira antes.');
        const importFrom: string | null = body.importFrom ? String(body.importFrom) : null;
        if (importFrom && !DATE_RE.test(importFrom)) throw new HttpError(400, 'invalid_date', 'Data inválida.');
        if (importFrom && body.deleteManual === true) {
          // o banco passa a mandar: some o que foi lançado à mão nessa conta a partir do corte
          const del = await db.from('transactions').delete()
            .eq('wallet_id', walletId).eq('account_id', ba.account_id).gte('date', importFrom).neq('source', 'import');
          if (del.error) throw del.error;
        }
        const upd = await db.from('bank_accounts').update({ import_from: importFrom }).eq('id', ba.id);
        if (upd.error) throw upd.error;
        break;
      }
      case 'alignBalance': {
        // saldo inicial da conta do app = saldo do banco − movimento já lançado,
        // pra que o saldo de hoje no app seja exatamente o do banco
        const ba = await loadBankAccount(String(body.bankAccountId ?? ''));
        if (!ba.account_id || ba.type !== 'BANK' || ba.balance_cents == null) {
          throw new HttpError(400, 'not_alignable', 'Só dá pra igualar o saldo de uma conta (não cartão) já ligada.');
        }
        const today = spDateISO(new Date());
        const txs = await db.from('transactions').select('kind, amount_cents, transfer_credit')
          .eq('account_id', ba.account_id).eq('status', 'cleared').lte('date', today);
        if (txs.error) throw txs.error;
        const moved = (txs.data ?? []).reduce((s, t) => {
          const v = Number(t.amount_cents);
          if (t.kind === 'income') return s + v;
          if (t.kind === 'expense') return s - v;
          return s + (t.transfer_credit ? v : -v);
        }, 0);
        const upd = await db.from('accounts').update({ opening_balance_cents: Number(ba.balance_cents) - moved })
          .eq('id', ba.account_id).eq('wallet_id', walletId);
        if (upd.error) throw upd.error;
        break;
      }
      case 'disconnect': {
        const connectionId = String(body.connectionId ?? '');
        await assertCanManageConnection(connectionId);
        const del = await db.from('bank_connections').delete().eq('id', connectionId).eq('wallet_id', walletId);
        if (del.error) throw del.error;
        break;
      }
      default: res.status(400).json({ error: 'invalid_action' }); return;
    }

    res.status(200).json(await listState(db, walletId, user.id));
  } catch (e) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.code, detail: e.message }); return; }
    const status = e instanceof PluggyError ? e.status : 400;
    res.status(status).json({ error: 'operation_failed', detail: (e as Error).message });
  }
}

async function syncAll(db: SupabaseClient, walletId: string): Promise<{ all: boolean; first?: string }> {
  const conns = await db.from('bank_connections').select('id, wallet_id, external_item_id, credential_id').eq('wallet_id', walletId);
  if (conns.error) throw conns.error;
  const errors: string[] = [];
  for (const c of conns.data ?? []) {
    try { await syncConnection(db, c); } catch (e) { errors.push((e as Error).message); }
  }
  return { all: errors.length > 0 && errors.length === (conns.data ?? []).length, first: errors[0] };
}

async function listState(db: SupabaseClient, walletId: string, userId: string) {
  const [conns, accs, mine] = await Promise.all([
    db.from('bank_connections')
      .select('id, external_item_id, status, execution_status, consent_expires_at, last_synced_at, error_code, created_at, created_by')
      .eq('wallet_id', walletId).order('created_at'),
    db.from('bank_accounts')
      .select('id, connection_id, name, type, subtype, number, balance_cents, credit_limit_cents, available_cents, due_date, account_id, refreshed_at, import_from, last_import_at')
      .eq('wallet_id', walletId).order('type').order('name'),
    db.from('pluggy_credentials').select('client_id, updated_at').eq('user_id', userId).maybeSingle(),
  ]);
  if (conns.error) throw conns.error;
  if (accs.error) throw accs.error;
  if (mine.error) throw mine.error;
  const cid = mine.data?.client_id as string | undefined;
  return {
    serverConfigured: pluggyConfigured(),
    credsKeyConfigured: credsKeyConfigured(),
    // só um pedaço do client id — o secret nunca sai do servidor
    myCredentials: cid ? { clientIdHint: `${cid.slice(0, 8)}…`, updatedAt: mine.data!.updated_at } : null,
    connections: conns.data ?? [],
    accounts: accs.data ?? [],
  };
}
