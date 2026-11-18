// Open Finance (Pluggy / Meu Pluggy) — Fase 1, só leitura.
//   GET  /api/v1/bank?wallet=<uuid>                → { configured, connections, accounts }
//   POST /api/v1/bank  { walletId, action, ... }
//     action 'connect'    { itemId }               (dono)  cadastra o item e lê as contas
//     action 'refresh'                              (membro) relê status e saldos na Pluggy
//     action 'link'       { bankAccountId, accountId|null } (dono) liga à conta da carteira
//     action 'disconnect' { connectionId }          (dono)  remove a conexão (só aqui; o item
//                                                           continua na Pluggy)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncConnection } from '../_lib/bank.js';
import { pluggyConfigured, PluggyError } from '../_lib/pluggy.js';
import { rateLimited } from '../_lib/rateLimit.js';
import { requireMember, requireUser } from './_util.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any> & { walletId?: string; action?: string };

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
      res.status(200).json({ configured: pluggyConfigured(), ...(await listState(db, walletId)) });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

    const body = (req.body ?? {}) as Body;
    const { walletId, action } = body;
    if (!walletId || !action) { res.status(400).json({ error: 'missing_fields' }); return; }
    const ownerOnly = action !== 'refresh';
    if (!(await requireMember(db, res, walletId, user.id, ownerOnly))) return;

    if (action === 'connect' || action === 'refresh') {
      if (!pluggyConfigured()) { res.status(503).json({ error: 'pluggy_not_configured', detail: 'Pluggy não configurada no servidor.' }); return; }
      // cada refresh/connect faz 2 chamadas na Pluggy — segura clique repetido
      if (rateLimited(`bank:${user.id}`, 10, 60_000)) {
        res.status(429).json({ error: 'rate_limited', detail: 'Muitas atualizações seguidas — espere um minuto.' }); return;
      }
    }

    switch (action) {
      case 'connect': {
        const itemId = String(body.itemId ?? '').trim();
        if (!UUID_RE.test(itemId)) { res.status(400).json({ error: 'invalid_item', detail: 'O ID do item tem formato de UUID (xxxxxxxx-xxxx-…).' }); return; }
        const existing = await db.from('bank_connections').select('id, wallet_id')
          .eq('provider', 'pluggy').eq('external_item_id', itemId).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data && existing.data.wallet_id !== walletId) {
          res.status(409).json({ error: 'item_in_other_wallet', detail: 'Esse banco já está conectado a outra carteira.' }); return;
        }
        let conn = existing.data;
        if (!conn) {
          const ins = await db.from('bank_connections')
            .insert({ wallet_id: walletId, provider: 'pluggy', external_item_id: itemId, created_by: user.id })
            .select('id, wallet_id').single();
          if (ins.error) throw ins.error;
          conn = ins.data;
        }
        try {
          await syncConnection(db, { id: conn.id, wallet_id: walletId, external_item_id: itemId });
        } catch (e) {
          // item inexistente/errado: não deixa uma conexão órfã pra trás
          if (!existing.data) await db.from('bank_connections').delete().eq('id', conn.id);
          throw e;
        }
        break;
      }
      case 'refresh': {
        const conns = await db.from('bank_connections').select('id, wallet_id, external_item_id').eq('wallet_id', walletId);
        if (conns.error) throw conns.error;
        const errors: string[] = [];
        for (const c of conns.data ?? []) {
          try { await syncConnection(db, c); } catch (e) { errors.push((e as Error).message); }
        }
        if (errors.length && errors.length === (conns.data ?? []).length) throw new Error(errors[0]);
        break;
      }
      case 'link': {
        const bankAccountId = String(body.bankAccountId ?? '');
        const accountId: string | null = body.accountId ? String(body.accountId) : null;
        const ba = await db.from('bank_accounts').select('id, type').eq('id', bankAccountId).eq('wallet_id', walletId).maybeSingle();
        if (ba.error) throw ba.error;
        if (!ba.data) { res.status(404).json({ error: 'not_found' }); return; }
        if (accountId) {
          const acc = await db.from('accounts').select('id, kind').eq('id', accountId).eq('wallet_id', walletId).maybeSingle();
          if (acc.error) throw acc.error;
          if (!acc.data) { res.status(404).json({ error: 'account_not_found' }); return; }
          const isCard = acc.data.kind === 'card';
          if (isCard !== (ba.data.type === 'CREDIT')) {
            res.status(400).json({ error: 'kind_mismatch', detail: 'Cartão do banco só liga a cartão da carteira (e conta só a conta).' }); return;
          }
          // uma conta da carteira só pode estar ligada a uma conta do banco
          const clear = await db.from('bank_accounts').update({ account_id: null })
            .eq('wallet_id', walletId).eq('account_id', accountId).neq('id', bankAccountId);
          if (clear.error) throw clear.error;
        }
        const upd = await db.from('bank_accounts').update({ account_id: accountId }).eq('id', bankAccountId);
        if (upd.error) throw upd.error;
        break;
      }
      case 'disconnect': {
        const del = await db.from('bank_connections').delete()
          .eq('id', String(body.connectionId ?? '')).eq('wallet_id', walletId);
        if (del.error) throw del.error;
        break;
      }
      default: res.status(400).json({ error: 'invalid_action' }); return;
    }

    res.status(200).json({ configured: true, ...(await listState(db, walletId)) });
  } catch (e) {
    const status = e instanceof PluggyError ? e.status : 400;
    res.status(status).json({ error: 'operation_failed', detail: (e as Error).message });
  }
}

async function listState(db: import('@supabase/supabase-js').SupabaseClient, walletId: string) {
  const [conns, accs] = await Promise.all([
    db.from('bank_connections')
      .select('id, external_item_id, status, execution_status, consent_expires_at, last_synced_at, error_code, created_at')
      .eq('wallet_id', walletId).order('created_at'),
    db.from('bank_accounts')
      .select('id, connection_id, name, type, subtype, number, balance_cents, credit_limit_cents, available_cents, due_date, account_id, refreshed_at')
      .eq('wallet_id', walletId).order('type').order('name'),
  ]);
  if (conns.error) throw conns.error;
  if (accs.error) throw accs.error;
  return { connections: conns.data ?? [], accounts: accs.data ?? [] };
}
