// Alvo do Vercel Cron (1x/dia). Envia os lembretes das contas fixas de saída em
// aberto (não lança nada sozinho). Também aceita chamada manual com
// ?key=<CRON_SECRET> (e ?date=yyyy-mm-dd para testar um dia específico).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../_lib/env.js';
import { runReminders } from '../_lib/reminders.js';
import { spDateISO } from '../_lib/shared.js';
import { admin } from '../_lib/supabaseAdmin.js';
import { syncConnection } from '../_lib/bank.js';
import { importWallet } from '../_lib/bankImport.js';

/** Atualiza status/saldos e importa os lançamentos de toda carteira com banco conectado. */
async function runBankImports(): Promise<Record<string, unknown>> {
  const db = admin();
  const { data, error } = await db.from('bank_connections').select('id, wallet_id, external_item_id, credential_id');
  if (error) return { error: error.message };
  const out: Record<string, unknown> = {};
  const wallets = new Set<string>();
  for (const c of data ?? []) {
    try { await syncConnection(db, c); } catch (e) { out[`sync:${c.id}`] = (e as Error).message; }
    wallets.add(c.wallet_id);
  }
  for (const w of wallets) {
    try {
      const r = await importWallet(db, w);
      out[w] = { created: r.created, updated: r.updated, deleted: r.deleted, errors: r.errors.length };
    } catch (e) { out[w] = (e as Error).message; }
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = env.cronSecret();
  const bearer = (req.headers.authorization ?? '').replace('Bearer ', '');
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (secret && bearer !== secret && key !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const today = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : spDateISO(new Date());
    // Open Finance antes dos lembretes: o que o banco já mandou entra primeiro
    const bank = await runBankImports();
    const summary = await runReminders(today);
    res.status(200).json({ ok: true, today, bank, ...summary });
  } catch (e) {
    console.error('[cron reminders]', e);
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
}
