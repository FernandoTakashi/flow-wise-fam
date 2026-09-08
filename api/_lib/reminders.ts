// Rotina diária: monta o lembrete das contas fixas de saída em aberto.
// NÃO lança nada sozinho (débito automático é só informativo). Idempotente
// via notification_log (um lembrete por conta por dia).
import { admin } from './supabaseAdmin.js';
import { sendMessage, type InlineButton } from './telegram.js';
import { loadWalletBundle, occurrenceTx, type RecurrenceRow } from './finance.js';
import { dayOfMonthISO, isoParts, recurrenceDueISO, formatBRL } from './shared.js';

export interface RunSummary {
  walletsChecked: number;
  messagesSent: number;
  lembretes: number;
  erros: string[];
}

async function loggedToday(recId: string, m: number, y: number, todayISO: string): Promise<boolean> {
  const { data } = await admin().from('notification_log').select('id')
    .eq('recurrence_id', recId).eq('kind', 'due').eq('ref_month', m).eq('ref_year', y)
    .eq('sent_on', todayISO).limit(1).maybeSingle();
  return !!data;
}
async function writeLog(walletId: string, recId: string, m: number, y: number, todayISO: string): Promise<void> {
  await admin().from('notification_log')
    .insert({ wallet_id: walletId, recurrence_id: recId, kind: 'due', ref_month: m, ref_year: y, sent_on: todayISO })
    .then(() => undefined, () => undefined);
}

function inWindow(r: RecurrenceRow, mStart: string, mEnd: string): boolean {
  return r.active && r.start_date <= mEnd && (!r.end_date || r.end_date >= mStart);
}

export async function runReminders(todayISO: string): Promise<RunSummary> {
  const db = admin();
  const summary: RunSummary = { walletsChecked: 0, messagesSent: 0, lembretes: 0, erros: [] };

  const { data: links, error } = await db.from('chat_links').select('provider, external_id, wallet_id');
  if (error) throw error;
  if (!links || links.length === 0) return summary;

  const byWallet = new Map<string, { provider: string; external_id: string }[]>();
  for (const l of links) {
    const arr = byWallet.get(l.wallet_id) ?? [];
    arr.push({ provider: l.provider, external_id: l.external_id });
    byWallet.set(l.wallet_id, arr);
  }

  const { m, y } = isoParts(todayISO);        // m: 0-11
  const refMonth = m + 1;
  const mStart = dayOfMonthISO(y, m, 1);
  const mEnd = dayOfMonthISO(y, m + 1, 0);

  for (const [walletId, chats] of byWallet) {
    summary.walletsChecked += 1;
    try {
      const bundle = await loadWalletBundle(walletId);
      const expenses = bundle.recurrences.filter((r) => r.kind === 'expense' && inWindow(r, mStart, mEnd));

      const due: { rec: RecurrenceRow; amount: number }[] = [];

      for (const rec of expenses) {
        const dueISO = recurrenceDueISO(y, m, rec.day);
        if (dueISO > todayISO) continue;                       // ainda não venceu
        const occ = await occurrenceTx(rec.id, m, y);
        if (occ && occ.status === 'cleared') continue;         // já pago
        if (await loggedToday(rec.id, refMonth, y, todayISO)) continue;

        due.push({ rec, amount: occ?.amount_cents ?? rec.amount_cents });
        await writeLog(walletId, rec.id, refMonth, y, todayISO);
        summary.lembretes += 1;
      }

      if (due.length === 0) continue;

      const lines = ['🔔 <b>Contas a pagar</b>'];
      const buttons: InlineButton[][] = [];
      for (const d of due) {
        const atraso = recurrenceDueISO(y, m, d.rec.day) < todayISO ? ' (em atraso)' : '';
        const diaTxt = d.rec.day <= 0 ? 'no último dia' : `dia ${d.rec.day}`;
        const auto = d.rec.autopay ? ' · débito automático' : '';
        lines.push(`• ${escapeHtml(d.rec.description)} — <b>${formatBRL(d.amount)}</b> · vence ${diaTxt}${auto}${atraso}`);
        if (buttons.length < 8) {
          buttons.push([{ text: `✅ Paguei: ${d.rec.description}`.slice(0, 60), callback_data: `pay:${d.rec.id}:${refMonth}:${y}` }]);
        }
      }

      const text = lines.join('\n');
      for (const c of chats) {
        if (c.provider !== 'telegram') continue;
        try {
          await sendMessage(c.external_id, text, buttons.length ? buttons : undefined);
          summary.messagesSent += 1;
        } catch (e) {
          summary.erros.push(`send ${c.external_id}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      summary.erros.push(`wallet ${walletId}: ${(e as Error).message}`);
    }
  }

  return summary;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
