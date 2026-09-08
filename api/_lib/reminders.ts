// Rotina diária: lança os débitos automáticos vencidos e monta o lembrete das
// contas manuais em aberto. Idempotente via notification_log.
import { admin } from './supabaseAdmin';
import { sendMessage, type InlineButton } from './telegram';
import { loadWalletBundle, markOccurrence, occurrenceTx, type RecurrenceRow } from './finance';
import { dayOfMonthISO, isoParts } from '../../src/lib/dates';
import { formatBRL } from '../../src/lib/money';

export interface RunSummary {
  walletsChecked: number;
  messagesSent: number;
  autopayLancados: number;
  lembretes: number;
  erros: string[];
}

async function loggedToday(recId: string, kind: string, m: number, y: number, todayISO: string): Promise<boolean> {
  const { data } = await admin().from('notification_log').select('id')
    .eq('recurrence_id', recId).eq('kind', kind).eq('ref_month', m).eq('ref_year', y)
    .eq('sent_on', todayISO).limit(1).maybeSingle();
  return !!data;
}
async function loggedEver(recId: string, kind: string, m: number, y: number): Promise<boolean> {
  const { data } = await admin().from('notification_log').select('id')
    .eq('recurrence_id', recId).eq('kind', kind).eq('ref_month', m).eq('ref_year', y).limit(1).maybeSingle();
  return !!data;
}
async function writeLog(walletId: string, recId: string, kind: string, m: number, y: number, todayISO: string): Promise<void> {
  await admin().from('notification_log')
    .insert({ wallet_id: walletId, recurrence_id: recId, kind, ref_month: m, ref_year: y, sent_on: todayISO })
    .then(() => undefined, () => undefined);
}

function inWindow(r: RecurrenceRow, mStart: string, mEnd: string): boolean {
  return r.active && r.start_date <= mEnd && (!r.end_date || r.end_date >= mStart);
}

export async function runReminders(todayISO: string): Promise<RunSummary> {
  const db = admin();
  const summary: RunSummary = { walletsChecked: 0, messagesSent: 0, autopayLancados: 0, lembretes: 0, erros: [] };

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

      const dueManual: { rec: RecurrenceRow; amount: number }[] = [];
      const autopayDone: { rec: RecurrenceRow; amount: number; onCard: boolean }[] = [];

      for (const rec of expenses) {
        const dueISO = dayOfMonthISO(y, m, rec.day);
        if (dueISO > todayISO) continue;                       // ainda não venceu

        const occ = await occurrenceTx(rec.id, m, y);
        if (occ && occ.status === 'cleared') continue;         // já pago/lançado

        const amount = occ?.amount_cents ?? rec.amount_cents;  // usa "valor informado" se houver

        if (rec.autopay) {
          if (await loggedEver(rec.id, 'autopay', refMonth, y)) continue;
          try {
            const res = await markOccurrence(bundle, walletId, rec, m, y, amount, null, 'auto');
            await writeLog(walletId, rec.id, 'autopay', refMonth, y, todayISO);
            autopayDone.push({ rec, amount, onCard: res.onCard });
            summary.autopayLancados += 1;
          } catch (e) {
            summary.erros.push(`autopay ${rec.description}: ${(e as Error).message}`);
          }
        } else {
          if (await loggedToday(rec.id, 'due', refMonth, y, todayISO)) continue;
          dueManual.push({ rec, amount });
          await writeLog(walletId, rec.id, 'due', refMonth, y, todayISO);
          summary.lembretes += 1;
        }
      }

      if (dueManual.length === 0 && autopayDone.length === 0) continue;

      const lines: string[] = [];
      const buttons: InlineButton[][] = [];

      if (dueManual.length) {
        lines.push('🔔 <b>Contas a pagar</b>');
        for (const d of dueManual) {
          const atraso = dayOfMonthISO(y, m, d.rec.day) < todayISO ? ' (em atraso)' : '';
          lines.push(`• ${escapeHtml(d.rec.description)} — <b>${formatBRL(d.amount)}</b> · vence dia ${d.rec.day}${atraso}`);
          if (buttons.length < 6) {
            buttons.push([{ text: `✅ Paguei: ${d.rec.description}`.slice(0, 60), callback_data: `pay:${d.rec.id}:${refMonth}:${y}` }]);
          }
        }
      }
      if (autopayDone.length) {
        if (lines.length) lines.push('');
        lines.push('💳 <b>Débito automático lançado</b>');
        for (const a of autopayDone) {
          lines.push(`• ${escapeHtml(a.rec.description)} — <b>${formatBRL(a.amount)}</b>${a.onCard ? ' · na fatura' : ''}`);
          if (buttons.length < 6) {
            buttons.push([{ text: `✏️ Ajustar valor: ${a.rec.description}`.slice(0, 60), callback_data: `adj:${a.rec.id}:${refMonth}:${y}` }]);
          }
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
