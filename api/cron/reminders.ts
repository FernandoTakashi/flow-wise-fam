// Alvo do Vercel Cron (1x/dia). Lança débitos automáticos vencidos e envia os
// lembretes das contas manuais. Também aceita chamada manual com ?key=<CRON_SECRET>
// (e ?date=yyyy-mm-dd para testar um dia específico).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../_lib/env.ts';
import { runReminders } from '../_lib/reminders.ts';
import { spDateISO } from '../../src/lib/dates.ts';

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
    const summary = await runReminders(today);
    res.status(200).json({ ok: true, today, ...summary });
  } catch (e) {
    console.error('[cron reminders]', e);
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
}
