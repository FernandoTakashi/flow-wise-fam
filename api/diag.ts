// Diagnóstico de ambiente/conectividade. Protegido pelo CRON_SECRET.
//   https://SEU-APP.vercel.app/api/diag?key=<CRON_SECRET>
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from './_lib/env.js';
import { admin } from './_lib/supabaseAdmin.js';
import { getMe } from './_lib/telegram.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = env.cronSecret();
  const bearer = (req.headers.authorization ?? '').replace('Bearer ', '');
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (secret && bearer !== secret && key !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const out: Record<string, unknown> = {};

  // 1. Presença das variáveis (sem revelar segredos)
  out.env = {
    SUPABASE_URL_raw: process.env.SUPABASE_URL ?? null,
    SUPABASE_URL_normalized: safe(() => env.supabaseUrl()),
    SUPABASE_SERVICE_ROLE_KEY_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY_len: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').length,
    ANTHROPIC_API_KEY_set: !!process.env.ANTHROPIC_API_KEY,
    TELEGRAM_BOT_TOKEN_set: !!process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET_clean: env.telegramWebhookSecret() ?? null,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL ?? null,
  };

  // 2. Alcança o host do Supabase?
  try {
    const url = `${env.supabaseUrl()}/auth/v1/health`;
    const r = await fetch(url);
    out.supabase_reach = { url, status: r.status, ok: r.ok };
  } catch (e) {
    out.supabase_reach = { error: String((e as Error).message ?? e) };
  }

  // 3. Query real (service role + RLS bypass)
  try {
    const r = await admin().from('chat_link_tokens').select('token').limit(1);
    out.supabase_query = r.error ? { error: r.error.message, code: r.error.code } : { ok: true, rows: r.data?.length ?? 0 };
  } catch (e) {
    out.supabase_query = { error: String((e as Error).message ?? e) };
  }

  // 4. Telegram
  try {
    const me = await getMe();
    out.telegram = { ok: true, bot: me.username ?? me.id };
  } catch (e) {
    out.telegram = { error: String((e as Error).message ?? e) };
  }

  res.status(200).json(out);
}

function safe(fn: () => string): string | null {
  try { return fn(); } catch { return null; }
}
