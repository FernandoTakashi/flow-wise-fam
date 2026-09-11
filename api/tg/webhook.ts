// Webhook do bot do Telegram: recebe mensagens e cliques de botão.
// Sempre responde 200 rápido (o Telegram re-tenta em não-200).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../_lib/env.js';
import {
  sendMessage, answerCallback, clearButtons, type TgUpdate, type TgMessage, type TgCallbackQuery,
} from '../_lib/telegram.js';
import { findLink, redeemToken, setPending, takePending, type ChatLink } from '../_lib/chat.js';
import { loadWalletBundle, insertEntry, markOccurrence, occurrenceTx } from '../_lib/finance.js';
import { buildWalletContext } from '../_lib/context.js';
import { interpret } from '../_lib/brain.js';
import { spDateISO, formatBRL, toCents, isoParts } from '../_lib/shared.js';

const HELP =
  'Oi, eu sou a <b>Carolina</b> 👋 — a assistente da <b>CaRe Wallet</b>.\n\n' +
  'Manda um gasto em uma linha — <code>mercado 87,50 nubank</code>, ' +
  '<code>uber 23</code>, <code>tv 3000 em 10x nubank</code> — que eu mostro um resumo pra você confirmar.\n\n' +
  'Pergunta à vontade: <i>qual meu saldo?</i> · <i>quanto falta pagar esse mês?</i> · ' +
  '<i>quanto gastei?</i> · <i>quando vence a fatura?</i>\n\n' +
  'E dá pra dizer <i>paguei o aluguel</i> pra marcar um fixo. Os lembretes de conta também chegam por aqui.';

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
    const bare = parseBareAmount(text);
    if (bare) {
      await adjustRecurrence(link, pending.payload as { recId: string; m: number; y: number }, bare, chatId);
      return;
    }
    // A mensagem não é só um número — o usuário quis fazer outra coisa
    // (ex.: lançar um gasto novo). Abandona o passo de ajuste e segue o fluxo
    // normal com o texto original.
  }

  const todayISO = spDateISO(new Date());
  const ctx = await buildWalletContext(link.wallet_id, todayISO);
  const action = await interpret(text, ctx);

  if (action.intent === 'reply') {
    await sendMessage(chatId, escapeHtml(action.text));
    return;
  }

  if (action.intent === 'pagar_fixo') {
    const bundle = await loadWalletBundle(link.wallet_id);
    const rec = bundle.recurrences.find((r) => r.id === action.recurrenceId);
    if (!rec) { await sendMessage(chatId, 'Não achei esse fixo.'); return; }
    const { m, y } = isoParts(todayISO);
    const occ = await occurrenceTx(rec.id, m, y);
    const amount = action.amountCents ?? occ?.amount_cents ?? rec.amount_cents;
    await markOccurrence(bundle, link.wallet_id, rec, m, y, amount, link.user_id, link.user_id, 'telegram', action.paidOnISO ?? todayISO);
    await setPending(link.id, 'adjust_recurrence', { recId: rec.id, m: m + 1, y });
    await sendMessage(chatId,
      `✅ <b>${escapeHtml(rec.description)}</b> ${rec.kind === 'income' ? 'recebido' : 'pago'} (${formatBRL(amount)}).\n` +
      'Veio outro valor? Toque em <b>Corrigir valor</b> ou responda só com o número.',
      [[{ text: '✏️ Corrigir valor', callback_data: `adj:${rec.id}:${m + 1}:${y}` }]]);
    return;
  }

  // lançamento
  const e = action.entry;
  const bundle = await loadWalletBundle(link.wallet_id);
  const pendingId = await setPending(link.id, 'new_tx', { entry: e });
  // mostra a MESMA conta que o insertEntry vai usar (conta citada, senão a 1ª de dinheiro)
  const chosenAcc = (e.accountId && bundle.accounts.find((a) => a.id === e.accountId))
    || bundle.accounts.find((a) => a.kind !== 'card' && !a.archived);
  const accName = chosenAcc?.name ?? 'conta principal';
  const catName = e.categoryId ? bundle.categories.find((c) => c.id === e.categoryId)?.name : null;
  const tipo = e.kind === 'income' ? '📥 Entrada' : '🧾 Saída';
  const extra = [
    e.installments && e.installments > 1 ? `${e.installments}×` : null,
    e.shared ? 'em conjunto' : null,
  ].filter(Boolean).join(' · ');

  await sendMessage(chatId,
    `${tipo}\n<b>${escapeHtml(e.description)}</b> — <b>${formatBRL(e.amountCents)}</b>\n` +
    `${escapeHtml(accName)} · ${e.dateISO}${catName ? ` · ${escapeHtml(catName)}` : ''}${extra ? ` · ${extra}` : ''}`,
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
        (r.parts > 1 ? ` em ${r.parts}×` : '') + (r.onCard ? ' (na fatura)' : ''));
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
      await markOccurrence(bundle, link.wallet_id, rec, month0, year, amount, link.user_id, link.user_id, 'telegram', spDateISO(new Date()));
      if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
      await answerCallback(cq.id, 'Pago ✅');
      await setPending(link.id, 'adjust_recurrence', { recId: rec.id, m: Number(a2), y: year });
      await sendMessage(chatId,
        `✅ <b>${escapeHtml(rec.description)}</b> marcado como pago (${formatBRL(amount)}).\n` +
        'Veio outro valor? Toque em <b>Corrigir valor</b> ou responda só com o número certo.',
        [[{ text: '✏️ Corrigir valor', callback_data: `adj:${a1}:${a2}:${a3}` }]]);
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
  link: ChatLink, payload: { recId: string; m: number; y: number }, cents: number, chatId: number,
) {
  const bundle = await loadWalletBundle(link.wallet_id);
  const rec = bundle.recurrences.find((r) => r.id === payload.recId);
  if (!rec) { await sendMessage(chatId, 'Recorrência não encontrada.'); return; }
  await markOccurrence(bundle, link.wallet_id, rec, payload.m - 1, payload.y, cents, link.user_id, link.user_id, 'telegram');
  await sendMessage(chatId, `✅ Valor de <b>${escapeHtml(rec.description)}</b> ajustado para ${formatBRL(cents)}.`);
}

/**
 * Só aceita a mensagem como "valor de ajuste" se ela for essencialmente um
 * número puro (opcional R$ / "reais"). "15,03 Uber crédito Itaú" NÃO passa —
 * isso é um lançamento novo, não a correção do fixo que acabou de ser pago.
 */
function parseBareAmount(text: string): number | null {
  const cleaned = text.trim()
    .replace(/^(r\$|rs)\s*/i, '')
    .replace(/\s*(reais?|contos?|pilas?|paus?)$/i, '')
    .trim();
  if (!/^\d{1,3}(\.\d{3})+(,\d{1,2})?$|^\d+(?:[.,]\d{1,2})?$/.test(cleaned)) return null;
  const cents = toCents(cleaned);
  return cents > 0 ? cents : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
