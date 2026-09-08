// Webhook do bot do Telegram: recebe mensagens e cliques de botão.
// Sempre responde 200 rápido (o Telegram re-tenta em não-200).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../_lib/env.js';
import {
  sendMessage, answerCallback, clearButtons, type TgUpdate, type TgMessage, type TgCallbackQuery,
} from '../_lib/telegram.js';
import { findLink, redeemToken, setPending, takePending, type ChatLink } from '../_lib/chat.js';
import { loadWalletBundle, insertEntry, markOccurrence, occurrenceTx } from '../_lib/finance.js';
import { parseEntry } from '../_lib/parse.js';
import { spDateISO } from '../_lib/shared.js';
import { formatBRL, toCents } from '../_lib/shared.js';

const HELP =
  'Manda um gasto em uma linha, ex.:\n' +
  '<code>mercado 87,50 nubank</code>\n' +
  '<code>ifood 42,90 crédito</code>\n' +
  '<code>recebi 200 de freela ontem</code>\n\n' +
  'Eu mostro um resumo e você confirma. Os lembretes de contas chegam aqui também.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  const secret = env.telegramWebhookSecret();
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    res.status(401).send('bad secret'); return;
  }

  try {
    const update = req.body as TgUpdate;
    if (update?.message?.text) await onMessage(update.message);
    else if (update?.callback_query) await onCallback(update.callback_query);
  } catch (e) {
    console.error('[tg webhook]', e);
  }
  res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------
async function onMessage(msg: TgMessage) {
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();

  if (text.startsWith('/start')) {
    const token = text.slice('/start'.length).trim();
    if (!token) {
      await sendMessage(chatId,
        'Oi! Para conectar, abra o app → <b>Ajustes → Integrações → Conectar Telegram</b> ' +
        'e toque no link gerado lá.');
      return;
    }
    const r = await redeemToken('telegram', String(chatId), token);
    await sendMessage(chatId, r.ok
      ? `✅ Conectado à carteira <b>${r.walletName}</b>${r.userName ? `, ${r.userName}` : ''}!\n\n${HELP}`
      : `❌ ${r.reason}`);
    return;
  }
  if (text === '/help' || text === '/ajuda') { await sendMessage(chatId, HELP); return; }
  if (text === '/id') { await sendMessage(chatId, `chat id: <code>${chatId}</code>`); return; }

  const link = await findLink('telegram', String(chatId));
  if (!link) {
    await sendMessage(chatId, 'Este chat não está conectado. Abra o app → Ajustes → Integrações → Conectar Telegram.');
    return;
  }

  const pending = await takePending(link.id);
  if (pending?.kind === 'adjust_recurrence') {
    await adjustRecurrence(link, pending.payload as { recId: string; m: number; y: number }, text, chatId);
    return;
  }

  // lançamento novo
  const bundle = await loadWalletBundle(link.wallet_id);
  const parsed = await parseEntry(text, {
    todayISO: spDateISO(new Date()),
    accounts: bundle.accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind })),
    categories: bundle.categories,
  });

  if (!parsed.understood) {
    await sendMessage(chatId,
      'Não achei um valor aí. Tenta assim: <code>mercado 87,50 nubank</code>');
    return;
  }

  const pendingId = await setPending(link.id, 'new_tx', { entry: parsed });
  const acc = parsed.accountId
    ? bundle.accounts.find((a) => a.id === parsed.accountId)?.name ?? 'conta padrão'
    : 'conta padrão';
  const cat = parsed.categoryId
    ? bundle.categories.find((c) => c.id === parsed.categoryId)?.name
    : null;
  const tipo = parsed.kind === 'income' ? '📥 Entrada' : '🧾 Saída';

  await sendMessage(chatId,
    `${tipo}\n<b>${escapeHtml(parsed.description)}</b> — <b>${formatBRL(parsed.amountCents)}</b>\n` +
    `${escapeHtml(acc)} · ${parsed.dateISO}${cat ? ` · ${escapeHtml(cat)}` : ''}`,
    [[
      { text: '✅ Confirmar', callback_data: `ok:${pendingId}` },
      { text: '✖️ Cancelar', callback_data: `no:${pendingId}` },
    ]]);
}

// ---------------------------------------------------------------------------
async function onCallback(cq: TgCallbackQuery) {
  const chatId = cq.message?.chat.id;
  const msgId = cq.message?.message_id;
  const data = cq.data ?? '';
  if (!chatId) { await answerCallback(cq.id); return; }

  const link = await findLink('telegram', String(chatId));
  if (!link) { await answerCallback(cq.id, 'Chat não conectado.'); return; }

  const [action, a1, a2, a3] = data.split(':');

  if (action === 'no') {
    await takePending(link.id, a1);
    if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
    await answerCallback(cq.id, 'Cancelado');
    return;
  }

  if (action === 'ok') {
    const p = await takePending(link.id, a1);
    if (!p || p.kind !== 'new_tx') { await answerCallback(cq.id, 'Esse pedido expirou.'); return; }
    const entry = (p.payload as { entry: Parameters<typeof insertEntry>[3] }).entry;
    try {
      const bundle = await loadWalletBundle(link.wallet_id);
      const r = await insertEntry(bundle, link.wallet_id, link.user_id, entry, 'telegram');
      if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
      await answerCallback(cq.id, 'Lançado ✅');
      await sendMessage(chatId,
        `✅ Lançado: <b>${escapeHtml(entry.description)}</b> — ${formatBRL(entry.amountCents)} · ${escapeHtml(r.accountName)}` +
        (r.onCard ? ' (na fatura)' : ''));
    } catch (e) {
      await answerCallback(cq.id, 'Erro ao lançar');
      await sendMessage(chatId, `❌ ${escapeHtml((e as Error).message)}`);
    }
    return;
  }

  if (action === 'pay' && a1 && a2 && a3) {
    const month0 = Number(a2) - 1;
    const year = Number(a3);
    try {
      const bundle = await loadWalletBundle(link.wallet_id);
      const rec = bundle.recurrences.find((r) => r.id === a1);
      if (!rec) { await answerCallback(cq.id, 'Recorrência não encontrada'); return; }
      const occ = await occurrenceTx(rec.id, month0, year);
      const amount = occ?.amount_cents ?? rec.amount_cents;
      await markOccurrence(bundle, link.wallet_id, rec, month0, year, amount, link.user_id, 'telegram');
      if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
      await answerCallback(cq.id, 'Pago ✅');
      await setPending(link.id, 'adjust_recurrence', { recId: rec.id, m: Number(a2), y: year });
      await sendMessage(chatId,
        `✅ <b>${escapeHtml(rec.description)}</b> marcado como pago (${formatBRL(amount)}).\n` +
        'Se veio outro valor, responda esta mensagem só com o número certo.');
    } catch (e) {
      await answerCallback(cq.id, 'Erro');
      await sendMessage(chatId, `❌ ${escapeHtml((e as Error).message)}`);
    }
    return;
  }

  if (action === 'adj' && a1 && a2 && a3) {
    await setPending(link.id, 'adjust_recurrence', { recId: a1, m: Number(a2), y: Number(a3) });
    await answerCallback(cq.id, 'Manda o valor');
    await sendMessage(chatId, 'Qual o valor real? Responda só com o número (ex.: <code>243,10</code>).');
    return;
  }

  await answerCallback(cq.id);
}

// ---------------------------------------------------------------------------
async function adjustRecurrence(
  link: ChatLink, payload: { recId: string; m: number; y: number }, text: string, chatId: number,
) {
  const cents = toCents(text);
  if (!cents || cents <= 0) {
    await sendMessage(chatId, 'Não entendi o valor. Responda só com o número, ex.: <code>243,10</code>.');
    await setPending(link.id, 'adjust_recurrence', payload); // mantém o passo
    return;
  }
  const bundle = await loadWalletBundle(link.wallet_id);
  const rec = bundle.recurrences.find((r) => r.id === payload.recId);
  if (!rec) { await sendMessage(chatId, 'Recorrência não encontrada.'); return; }
  await markOccurrence(bundle, link.wallet_id, rec, payload.m - 1, payload.y, cents, link.user_id, 'telegram');
  await sendMessage(chatId, `✅ Valor de <b>${escapeHtml(rec.description)}</b> ajustado para ${formatBRL(cents)}.`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
