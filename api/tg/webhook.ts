// Webhook do bot do Telegram: recebe mensagens e cliques de botão.
// Sempre responde 200 rápido (o Telegram re-tenta em não-200).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../_lib/env.js';
import {
  sendMessage, answerCallback, clearButtons, downloadPhoto,
  type TgUpdate, type TgMessage, type TgCallbackQuery, type InlineButton,
} from '../_lib/telegram.js';
import { findLink, redeemToken, setPending, takePending, type ChatLink } from '../_lib/chat.js';
import {
  loadWalletBundle, insertEntry, markOccurrence, occurrenceTx,
  payInvoice, createRecurrence, lastTransaction, deleteEntry,
} from '../_lib/finance.js';
import { buildWalletContext } from '../_lib/context.js';
import { interpret, interpretImage, type BotEntry } from '../_lib/brain.js';
import { spDateISO, formatBRL, toCents, isoParts, dayOfMonthISO } from '../_lib/shared.js';

const HELP =
  'Oi, eu sou a <b>Carolina</b> 👋 — a assistente da <b>CaRe Wallet</b>.\n\n' +
  'Manda um gasto em uma linha — <code>mercado 87,50 nubank</code>, ' +
  '<code>uber 23</code>, <code>tv 3000 em 10x nubank</code> — que eu mostro um resumo pra você confirmar.\n\n' +
  'Ou manda a <b>foto de um comprovante</b> (PIX, cartão, boleto) que eu leio o valor sozinha.\n\n' +
  'Pergunta à vontade: <i>qual meu saldo?</i> · <i>quanto falta pagar esse mês?</i> · ' +
  '<i>quanto gastei?</i> · <i>quando vence a fatura?</i>\n\n' +
  'Também entendo:\n' +
  '• <i>paguei o aluguel</i> — dá baixa num fixo\n' +
  '• <i>paguei a fatura do nubank</i> — quita a fatura do cartão\n' +
  '• <i>cadastra academia 89,90 todo dia 10</i> — cria um fixo novo\n' +
  '• <i>desfaz</i> ou /desfazer — apaga o último lançamento que você fez\n\n' +
  'Os lembretes de conta também chegam por aqui.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  const secret = env.telegramWebhookSecret();
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    res.status(401).send('bad secret'); return;
  }

  try {
    const update = req.body as TgUpdate;
    if (update?.message?.text) await onMessage(update.message);
    else if (update?.message?.photo?.length) await onPhoto(update.message);
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

  if (text === '/desfazer') { await promptUndo(link, chatId); return; }

  const todayISO = spDateISO(new Date());
  const ctx = await buildWalletContext(link.wallet_id, todayISO);

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

  if (pending?.kind === 'complement_tx') {
    const entry = (pending.payload as { entry: BotEntry }).entry;
    const acc = matchByName(text, ctx.contasParaLancar.map((a) => ({ id: a.id, name: a.nome })));
    const cat = matchByName(text, ctx.categorias.map((c) => ({ id: c.id, name: c.nome })));
    if (!acc && !cat) {
      await setPending(link.id, 'complement_tx', { entry });
      await sendMessage(chatId, 'Não achei essa conta/categoria na sua carteira. Tenta o nome como aparece no app (ex.: "Nubank", "Mercado").');
      return;
    }
    await promptLancamento(link, chatId, {
      ...entry,
      accountId: acc?.id ?? entry.accountId,
      categoryId: cat?.id ?? entry.categoryId,
    });
    return;
  }

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

  if (action.intent === 'pagar_fatura') {
    const bundle = await loadWalletBundle(link.wallet_id);
    const card = bundle.accounts.find((a) => a.id === action.cardId);
    const fromAcc = bundle.accounts.find((a) => a.id === action.fromAccountId);
    if (!card || !fromAcc) { await sendMessage(chatId, 'Não achei esse cartão ou conta.'); return; }
    const fatura = ctx.faturas.find((f) => f.cartaoId === action.cardId);
    const pendingId = await setPending(link.id, 'pay_fatura', {
      cardId: action.cardId, fromAccountId: action.fromAccountId, paidOnISO: action.paidOnISO,
    });
    await sendMessage(chatId,
      `💳 Pagar a fatura do <b>${escapeHtml(card.name)}</b>${fatura ? ` (${fatura.aberto})` : ''} ` +
      `com <b>${escapeHtml(fromAcc.name)}</b>?`,
      [[
        { text: '✅ Confirmar', callback_data: `ok:${pendingId}` },
        { text: '✖️ Cancelar', callback_data: `no:${pendingId}` },
      ]]);
    return;
  }

  if (action.intent === 'criar_fixo') {
    const f = action.fixo;
    const pendingId = await setPending(link.id, 'criar_fixo', { fixo: f });
    const diaLabel = f.day <= 0 ? 'último dia do mês' : `dia ${f.day}`;
    await sendMessage(chatId,
      `🔁 Novo fixo (${f.kind === 'income' ? 'entrada' : 'saída'}): <b>${escapeHtml(f.description)}</b> — ` +
      `<b>${formatBRL(f.amountCents)}</b>, todo ${diaLabel}. Confirma?`,
      [[
        { text: '✅ Confirmar', callback_data: `ok:${pendingId}` },
        { text: '✖️ Cancelar', callback_data: `no:${pendingId}` },
      ]]);
    return;
  }

  if (action.intent === 'desfazer') { await promptUndo(link, chatId); return; }

  // lançamento
  await promptLancamento(link, chatId, action.entry);
}

// ---------------------------------------------------------------------------
async function onPhoto(msg: TgMessage) {
  const chatId = msg.chat.id;
  const link = await findLink('telegram', String(chatId));
  if (!link) {
    await sendMessage(chatId, 'Este chat não está conectado. Abra o app → Ajustes → Integrações → Conectar Telegram.');
    return;
  }
  const photo = msg.photo?.at(-1); // maior resolução
  if (!photo) return;

  try {
    const { base64, mediaType } = await downloadPhoto(photo.file_id);
    const todayISO = spDateISO(new Date());
    const ctx = await buildWalletContext(link.wallet_id, todayISO);
    const action = await interpretImage(base64, mediaType, ctx, msg.caption);

    if (action.intent === 'reply') { await sendMessage(chatId, escapeHtml(action.text)); return; }
    if (action.intent === 'lancamento') { await promptLancamento(link, chatId, action.entry); return; }
  } catch (e) {
    console.error('[tg webhook] onPhoto', e);
    await sendMessage(chatId, '❌ Não consegui processar essa foto. Tenta de novo ou manda o valor em texto.');
  }
}

/**
 * Mostra o resumo de um lançamento (texto ou foto de comprovante) com
 * [Confirmar]/[Cancelar]. Se a conta ou a categoria não foram identificadas
 * (comum em foto de comprovante), oferece um botão pra completar por texto
 * antes de confirmar, em vez de só aceitar o palpite calado.
 */
async function promptLancamento(link: ChatLink, chatId: number, e: BotEntry): Promise<void> {
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

  const missingAcc = !e.accountId;
  const missingCat = !e.categoryId;
  const warn = missingAcc ? `\n⚠️ Não identifiquei a conta — usei <b>${escapeHtml(accName)}</b>.` : '';

  const buttons: InlineButton[][] = [[
    { text: '✅ Confirmar', callback_data: `ok:${pendingId}` },
    { text: '✖️ Cancelar', callback_data: `no:${pendingId}` },
  ]];
  if (missingAcc || missingCat) {
    buttons.push([{ text: '✏️ Completar conta/categoria', callback_data: `comp:${pendingId}` }]);
  }

  await sendMessage(chatId,
    `${tipo}\n<b>${escapeHtml(e.description)}</b> — <b>${formatBRL(e.amountCents)}</b>\n` +
    `${escapeHtml(accName)} · ${e.dateISO}${catName ? ` · ${escapeHtml(catName)}` : ''}${extra ? ` · ${extra}` : ''}${warn}`,
    buttons);
}

/** Acha, entre `items`, o de nome mais específico (mais longo) citado em `text`. */
function matchByName<T extends { id: string; name: string }>(text: string, items: T[]): T | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const t = norm(text);
  const hits = items.filter((it) => it.name && t.includes(norm(it.name)));
  hits.sort((a, b) => b.name.length - a.name.length);
  return hits[0] ?? null;
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
    if (!p) { await answerCallback(cq.id, 'Esse pedido expirou.'); return; }

    try {
      if (p.kind === 'new_tx') {
        const entry = (p.payload as { entry: Parameters<typeof insertEntry>[3] }).entry;
        const bundle = await loadWalletBundle(link.wallet_id);
        const r = await insertEntry(bundle, link.wallet_id, link.user_id, entry, 'telegram');
        if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
        await answerCallback(cq.id, 'Lançado ✅');
        await sendMessage(chatId,
          `✅ Lançado: <b>${escapeHtml(entry.description)}</b> — ${formatBRL(entry.amountCents)} · ${escapeHtml(r.accountName)}` +
          (r.parts > 1 ? ` em ${r.parts}×` : '') + (r.onCard ? ' (na fatura)' : ''));
        return;
      }

      if (p.kind === 'pay_fatura') {
        const { cardId, fromAccountId, paidOnISO } = p.payload as { cardId: string; fromAccountId: string; paidOnISO: string | null };
        const bundle = await loadWalletBundle(link.wallet_id);
        const card = bundle.accounts.find((acc) => acc.id === cardId);
        const dateISO = paidOnISO ?? spDateISO(new Date());
        const { m, y } = isoParts(dateISO);
        await payInvoice(link.wallet_id, cardId, card?.name ?? 'cartão', fromAccountId, m, y, dateISO, link.user_id, link.user_id);
        if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
        await answerCallback(cq.id, 'Fatura paga ✅');
        await sendMessage(chatId, `✅ Fatura do <b>${escapeHtml(card?.name ?? 'cartão')}</b> paga.`);
        return;
      }

      if (p.kind === 'criar_fixo') {
        const f = (p.payload as { fixo: import('../_lib/brain.js').BotFixo }).fixo;
        const { y, m } = isoParts(spDateISO(new Date()));
        await createRecurrence(link.wallet_id, {
          description: f.description, kind: f.kind, amountCents: f.amountCents, day: f.day,
          accountId: f.accountId, categoryId: f.categoryId, startDate: dayOfMonthISO(y, m, 1),
        });
        if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
        await answerCallback(cq.id, 'Fixo criado ✅');
        await sendMessage(chatId, `✅ Fixo <b>${escapeHtml(f.description)}</b> criado — ${formatBRL(f.amountCents)}.`);
        return;
      }

      if (p.kind === 'undo_tx') {
        const { txId, description, amountCents } = p.payload as { txId: string; description: string; amountCents: number };
        await deleteEntry(link.wallet_id, txId);
        if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
        await answerCallback(cq.id, 'Apagado ✅');
        await sendMessage(chatId, `🗑️ Apagado: <b>${escapeHtml(description)}</b> — ${formatBRL(amountCents)}.`);
        return;
      }

      await answerCallback(cq.id, 'Esse pedido expirou.');
    } catch (e) {
      await answerCallback(cq.id, 'Erro');
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

  if (action === 'comp' && a1) {
    const p = await takePending(link.id, a1);
    if (!p || p.kind !== 'new_tx') { await answerCallback(cq.id, 'Esse pedido expirou.'); return; }
    const entry = (p.payload as { entry: BotEntry }).entry;
    await setPending(link.id, 'complement_tx', { entry });
    if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
    await answerCallback(cq.id);
    await sendMessage(chatId, 'Me diz a conta e/ou a categoria (ex.: "Nubank, mercado").');
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

/** Acha o último lançamento desta pessoa e pergunta se é pra apagar. Usado por /desfazer e pelo intent "desfazer". */
async function promptUndo(link: ChatLink, chatId: number): Promise<void> {
  const tx = await lastTransaction(link.wallet_id, link.user_id);
  if (!tx) { await sendMessage(chatId, 'Não achei nenhum lançamento seu recente pra desfazer.'); return; }
  const pendingId = await setPending(link.id, 'undo_tx', {
    txId: tx.id, description: tx.description || (tx.kind === 'income' ? 'Entrada' : 'Saída'), amountCents: tx.amount_cents,
  });
  await sendMessage(chatId,
    `🗑️ Apagar <b>${escapeHtml(tx.description || '—')}</b> — ${formatBRL(tx.amount_cents)} (${tx.date})?`,
    [[
      { text: '✅ Sim, apagar', callback_data: `ok:${pendingId}` },
      { text: '✖️ Cancelar', callback_data: `no:${pendingId}` },
    ]]);
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
