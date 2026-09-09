// Leitura centralizada das variáveis de ambiente do backend (Vercel Functions).
// Nada aqui vai para o bundle do frontend.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/** Tolera valor colado com aspas/espaços e sem esquema. */
function normalizeUrl(raw: string): string {
  let v = raw.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  return v;
}

export const env = {
  supabaseUrl: () => normalizeUrl(required('SUPABASE_URL')),
  supabaseServiceRole: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  anthropicKey: () => optional('ANTHROPIC_API_KEY'),
  anthropicWorkspaceId: () => optional('ANTHROPIC_WORKSPACE_ID'),
  telegramToken: () => required('TELEGRAM_BOT_TOKEN'),
  // Telegram só aceita [A-Za-z0-9_-] no secret_token; limpa o valor e usa o
  // mesmo resultado no setWebhook e na verificação do header.
  telegramWebhookSecret: () => {
    const v = optional('TELEGRAM_WEBHOOK_SECRET');
    const clean = v ? v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 256) : '';
    return clean.length > 0 ? clean : undefined;
  },
  telegramBotUsername: () => optional('TELEGRAM_BOT_USERNAME'),
  cronSecret: () => optional('CRON_SECRET'),
  publicAppUrl: () => optional('PUBLIC_APP_URL') ?? 'https://financeapp.vercel.app',
};
