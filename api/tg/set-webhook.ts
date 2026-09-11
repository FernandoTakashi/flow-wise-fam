// Registra o webhook do bot no Telegram. Chame uma vez após o deploy:
//   https://SEU-APP.vercel.app/api/tg/set-webhook?key=<CRON_SECRET>
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../_lib/env.js';
import { setWebhook, setMyCommands, getMe } from '../_lib/telegram.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = env.cronSecret();
  const bearer = (req.headers.authorization ?? '').replace('Bearer ', '');
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (secret && bearer !== secret && key !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const base = env.publicAppUrl().replace(/\/+$/, '');
    const url = `${base}/api/tg/webhook`;
    await setWebhook(url, env.telegramWebhookSecret());
    await setMyCommands([
      { command: 'ajuda', description: 'O que eu sei fazer' },
      { command: 'desfazer', description: 'Apagar o último lançamento' },
      { command: 'id', description: 'Ver o id deste chat' },
    ]);
    const me = await getMe();
    res.status(200).json({ ok: true, webhook: url, bot: me.username ?? me.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
}
