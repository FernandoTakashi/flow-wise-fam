// Webhook do bot do Telegram: recebe mensagens e cliques de botão.
// Sempre responde 200 rápido (o Telegram re-tenta em não-200).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../_lib/env.js';
import {
  sendMessage, answerCallback, clearButtons, editMessageText, downloadPhoto,
  type TgUpdate, type TgMessage, type TgCallbackQuery, type TgChatMemberUpdate, type InlineButton,
} from '../_lib/telegram.js';
import { findLink, redeemToken, setPending, takePending, type ChatLink } from '../_lib/chat.js';
import {
  loadWalletBundle, insertEntry, markOccurrence, occurrenceTx,
  payInvoice, createRecurrence, lastTransaction, deleteEntry,
} from '../_lib/finance.js';
import { buildWalletContext } from '../_lib/context.js';
import { interpret, interpretImage, interpretSplit, interpretSplitImage, type BotEntry, type BotSplitAction } from '../_lib/brain.js';
import { spDateISO, formatBRL, toCents, isoParts, dayOfMonthISO } from '../_lib/shared.js';
import { buildSplitGroupContext, type SplitGroupContext } from '../_lib/splitContext.js';
import {
  findSplitGroupIdByTelegramChat, createSplitGroupFromTelegram, connectTelegramChat,
  findOrCreateTelegramMember, createSplitExpense, createSplitPayment, getSplitInvitePreview,
  resolveUserIdForTelegram, resolveSplitTelegramInvite, linkTelegramToUser,
} from '../_lib/splitFinance.js';
import { setSplitPending, peekSplitPending, updateSplitPendingPayload, deleteSplitPending } from '../_lib/splitChat.js';

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
    // Roteamento por tipo de chat ACONTECE PRIMEIRO, antes de tocar em
    // qualquer tabela — chat privado nunca entra no caminho de código do
    // grupo, e vice-versa. Ver docs/QA_CHECKLIST.md e o dossiê do Dividir.
    if (update?.message?.text) {
      if (update.message.chat.type === 'private') await onMessage(update.message);
      else await onGroupMessage(update.message);
    } else if (update?.message?.photo?.length) {
      if (update.message.chat.type === 'private') await onPhoto(update.message);
      else await onGroupPhoto(update.message);
    } else if (update?.callback_query) {
      const chatType = update.callback_query.message?.chat.type;
      if (!chatType || chatType === 'private') await onCallback(update.callback_query);
      else await onGroupCallback(update.callback_query);
    } else if (update?.chat_member) {
      await onChatMember(update.chat_member);
    }
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

// ---------------------------------------------------------------------------
// "Dividir" — grupo do Telegram. Isolado de propósito: nunca chama findLink,
// buildWalletContext, interpret() ou qualquer função de finance.ts. Se o
// grupo não está conectado a nenhum split_group, a Carolina fica quieta —
// não fica repetindo "não estou conectado" a cada mensagem de um grupo
// qualquer em que ela foi adicionada por engano.
// ---------------------------------------------------------------------------
interface DespesaPendingPayload {
  description: string; amountCents: number; dateISO: string; paidBy: string; participantIds: string[];
}

/** Card de confirmação de despesa — reaproveitado por texto, foto e pelo "voltar" do editor de participantes. */
function renderDespesaCard(ctx: SplitGroupContext, p: DespesaPendingPayload, pendingId: string): { text: string; buttons: InlineButton[][] } {
  const payerName = ctx.membros.find((m) => m.id === p.paidBy)?.nome ?? '—';
  const names = p.participantIds.map((id) => ctx.membros.find((m) => m.id === id)?.nome).filter(Boolean).join(', ') || '—';
  return {
    text: `💸 <b>${escapeHtml(p.description)}</b> — <b>${formatBRL(p.amountCents)}</b>\n` +
      `Pago por <b>${escapeHtml(payerName)}</b>, dividido entre: ${escapeHtml(names)}.`,
    buttons: [
      [{ text: '✅ Confirmar', callback_data: `oksplit:${pendingId}` }, { text: '✖️ Cancelar', callback_data: `nosplit:${pendingId}` }],
      [{ text: '✏️ Editar participantes', callback_data: `editsplit:${pendingId}` }],
    ],
  };
}

// callback_data do Telegram tem limite de 64 bytes — dois uuid (pendingId +
// memberId) juntos passam disso. Em vez do id, usa a POSIÇÃO do membro numa
// ordem determinística (por id, não a ordem "natural" da query, que não tem
// garantia de ser estável) — recalculada igual dos dois lados.
function sortedMembros(ctx: SplitGroupContext): SplitGroupContext['membros'] {
  return [...ctx.membros].sort((a, b) => a.id.localeCompare(b.id));
}

/** Um botão por membro (✅/⬜) — tocar alterna, "Pronto" volta pro card de confirmação. */
function renderParticipantEditor(ctx: SplitGroupContext, p: DespesaPendingPayload, pendingId: string): { text: string; buttons: InlineButton[][] } {
  const buttons: InlineButton[][] = sortedMembros(ctx).map((m, i) => [{
    text: `${p.participantIds.includes(m.id) ? '✅' : '⬜'} ${m.nome}`,
    callback_data: `togglep:${pendingId}:${i}`,
  }]);
  buttons.push([{ text: 'Pronto', callback_data: `doneeditsplit:${pendingId}` }]);
  return { text: `Quem participa de <b>${escapeHtml(p.description)}</b> — ${formatBRL(p.amountCents)}?`, buttons };
}

async function sendDespesaConfirm(
  chatId: number, groupId: string, fromId: number, ctx: SplitGroupContext, payerMemberId: string, action: Extract<BotSplitAction, { intent: 'despesa' }>,
): Promise<void> {
  const participantIds = action.participantIds ?? ctx.membros.map((m) => m.id);
  const payload: DespesaPendingPayload = {
    description: action.description, amountCents: action.amountCents, dateISO: action.dateISO,
    paidBy: payerMemberId, participantIds,
  };
  const pendingId = await setSplitPending(groupId, fromId, 'despesa', payload as unknown as Record<string, unknown>);
  const { text, buttons } = renderDespesaCard(ctx, payload, pendingId);
  await sendMessage(chatId, text, buttons);
}

async function onGroupMessage(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  const text = (msg.text ?? '').trim();
  if (!fromId || !text) return;

  if (text.startsWith('/iniciar')) { await handleIniciar(msg); return; }
  if (text.startsWith('/conectar')) { await handleConectar(msg); return; }
  if (text.startsWith('/')) return; // outros comandos não existem no modo grupo — ignora

  const groupId = await findSplitGroupIdByTelegramChat(String(chatId));
  if (!groupId) return;

  const senderName = msg.from?.first_name?.trim() || msg.from?.username || 'Alguém';
  const member = await findOrCreateTelegramMember(groupId, fromId, senderName);
  const { ctx } = await buildSplitGroupContext(groupId);
  const action = await interpretSplit(text, ctx, member.display_name);

  if (action.intent === 'ignorar') return;
  if (action.intent === 'reply') { await sendMessage(chatId, escapeHtml(action.text)); return; }

  if (action.intent === 'despesa') { await sendDespesaConfirm(chatId, groupId, fromId, ctx, member.id, action); return; }

  if (action.intent === 'acerto') {
    const toMember = ctx.membros.find((m) => m.id === action.toMemberId);
    const pendingId = await setSplitPending(groupId, fromId, 'acerto', {
      fromMember: member.id, toMember: action.toMemberId, amountCents: action.amountCents, dateISO: action.dateISO,
    });
    await sendMessage(chatId,
      `🤝 <b>${escapeHtml(member.display_name)}</b> pagou <b>${formatBRL(action.amountCents)}</b> pra <b>${escapeHtml(toMember?.nome ?? '—')}</b>. Confirma?`,
      [[
        { text: '✅ Confirmar', callback_data: `oksplit:${pendingId}` },
        { text: '✖️ Cancelar', callback_data: `nosplit:${pendingId}` },
      ]]);
    return;
  }
}

/** Foto de nota fiscal/comprovante mandada num grupo já conectado ao Dividir. */
async function onGroupPhoto(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  if (!fromId) return;
  const groupId = await findSplitGroupIdByTelegramChat(String(chatId));
  if (!groupId) return; // grupo não conectado — foto solta não vira nada, sem spam de aviso

  const photo = msg.photo?.at(-1);
  if (!photo) return;

  try {
    const senderName = msg.from?.first_name?.trim() || msg.from?.username || 'Alguém';
    const member = await findOrCreateTelegramMember(groupId, fromId, senderName);
    const { ctx } = await buildSplitGroupContext(groupId);
    const { base64, mediaType } = await downloadPhoto(photo.file_id);
    const action = await interpretSplitImage(base64, mediaType, ctx, member.display_name, msg.caption);

    if (action.intent === 'reply') { await sendMessage(chatId, escapeHtml(action.text)); return; }
    if (action.intent === 'despesa') { await sendDespesaConfirm(chatId, groupId, fromId, ctx, member.id, action); return; }
  } catch (e) {
    console.error('[tg webhook] onGroupPhoto', e);
    await sendMessage(chatId, '❌ Não consegui processar essa foto. Tenta de novo ou manda o valor em texto.');
  }
}

/** /iniciar — cria um split_group novo direto do grupo do Telegram, sem passar pelo app. */
async function handleIniciar(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  if (!fromId) return;
  const already = await findSplitGroupIdByTelegramChat(String(chatId));
  if (already) { await sendMessage(chatId, 'Esse grupo já está conectado ao Dividir — pode mandar os gastos direto.'); return; }

  try {
    const senderName = msg.from?.first_name?.trim() || msg.from?.username || 'Alguém';
    const { member } = await createSplitGroupFromTelegram(
      String(chatId), msg.chat.title ?? 'Grupo do Telegram', fromId, senderName,
    );
    await sendMessage(chatId,
      `🤝 Grupo <b>${escapeHtml(msg.chat.title ?? 'sem nome')}</b> conectado ao Dividir!\n\n` +
      `A partir de agora, é só mandar o que cada um gastou — ex.: <i>"paguei o jantar, 180"</i> — que eu divido igual entre quem já apareceu aqui.\n` +
      `${escapeHtml(member.display_name)} já é o primeiro membro.`);
  } catch (e) {
    await sendMessage(chatId, `❌ Não consegui criar o grupo: ${escapeHtml((e as Error).message)}`);
  }
}

/** /conectar <token> — liga este grupo do Telegram a um split_group já criado no app. */
async function handleConectar(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const token = msg.text?.slice('/conectar'.length).trim();
  if (!token) { await sendMessage(chatId, 'Usa assim: <code>/conectar &lt;token do convite&gt;</code> (gerado no app, botão Convidar).'); return; }

  try {
    const preview = await getSplitInvitePreview(token);
    if (!preview) { await sendMessage(chatId, '❌ Esse convite não é válido ou já foi desativado.'); return; }
    await connectTelegramChat(token, String(chatId));
    await sendMessage(chatId,
      `🤝 Este grupo agora está conectado ao Dividir → <b>${escapeHtml(preview.groupName)}</b>.\n` +
      'É só mandar o que cada um gastou que eu divido igual entre quem aparecer aqui.');
  } catch (e) {
    await sendMessage(chatId, `❌ ${escapeHtml((e as Error).message)}`);
  }
}

/**
 * Alguém entrou (ou saiu/mudou de status) num chat onde a Carolina está.
 * Só nos importa quando é uma entrada via link individual gerado pelo app
 * (ver POST /v1/split resource=telegramInvite) — aí já sabemos quem é sem
 * perguntar nada, e só ligamos o Telegram da pessoa na conta dela
 * (chat_links). Não mexe em split_members: esse membro já existe desde que
 * ela entrou no grupo pelo site.
 */
async function onChatMember(update: TgChatMemberUpdate): Promise<void> {
  if (update.chat.type === 'private') return; // convite individual é sempre pra um grupo
  if (update.new_chat_member.status !== 'member') return;
  const inviteLink = update.invite_link?.invite_link;
  if (!inviteLink) return;
  try {
    const resolved = await resolveSplitTelegramInvite(inviteLink);
    if (!resolved) return; // link do Telegram que não veio da gente (convite normal do grupo etc.)
    await linkTelegramToUser(update.new_chat_member.user.id, resolved.userId);
  } catch (e) {
    console.error('[tg webhook] onChatMember', e);
  }
}

/**
 * Botões de confirmação do modo grupo. NUNCA chama findLink/chat_pending —
 * completamente separado do fluxo de callback da carteira (onCallback).
 * Só quem gerou a pendência pode confirmar o próprio botão.
 */
const EDIT_ACTIONS = ['editsplit', 'togglep', 'doneeditsplit'] as const;

async function onGroupCallback(cq: TgCallbackQuery): Promise<void> {
  const chatId = cq.message?.chat.id;
  const msgId = cq.message?.message_id;
  const data = cq.data ?? '';
  if (!chatId) { await answerCallback(cq.id); return; }
  const [action, pendingId, extra] = data.split(':');
  const isEditAction = (EDIT_ACTIONS as readonly string[]).includes(action);
  if (!pendingId || (!isEditAction && action !== 'oksplit' && action !== 'nosplit')) { await answerCallback(cq.id); return; }

  // SEMPRE espia primeiro (nunca consome antes de saber quem está clicando)
  // — antes disso, qualquer pessoa clicando errado apagava a pendência de
  // verdade (takeSplitPending já deletava antes do "isso não é seu"), e
  // quem lançou não conseguia mais confirmar depois.
  const pending = await peekSplitPending(pendingId);
  if (!pending) { await answerCallback(cq.id, 'Esse pedido expirou.'); return; }
  if (pending.telegramUserId !== cq.from.id) {
    await answerCallback(cq.id, 'Isso não é seu — só quem lançou pode confirmar.');
    return;
  }

  // Editar participantes só atualiza o payload — não apaga a pendência,
  // porque os botões da mensagem continuam usando o MESMO pendingId.
  if (isEditAction) {
    if (pending.kind !== 'despesa') { await answerCallback(cq.id); return; }

    const p = pending.payload as unknown as DespesaPendingPayload;
    const { ctx } = await buildSplitGroupContext(pending.groupId);

    if (action === 'togglep' && extra) {
      const idx = Number(extra);
      const member = sortedMembros(ctx)[idx];
      if (member) {
        const set = new Set(p.participantIds);
        if (set.has(member.id)) { if (set.size > 1) set.delete(member.id); } else { set.add(member.id); }
        p.participantIds = [...set];
        await updateSplitPendingPayload(pendingId, p as unknown as Record<string, unknown>);
      }
    }

    const view = action === 'doneeditsplit'
      ? renderDespesaCard(ctx, p, pendingId)
      : renderParticipantEditor(ctx, p, pendingId);
    if (msgId) await editMessageText(chatId, msgId, view.text, view.buttons).catch((e) => console.error('[tg webhook] editMessageText', e));
    await answerCallback(cq.id);
    return;
  }

  if (action === 'nosplit') {
    await deleteSplitPending(pendingId);
    if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
    await answerCallback(cq.id, 'Cancelado');
    return;
  }

  try {
    await deleteSplitPending(pendingId);
    // "quem criou" pro app é sempre uma conta de verdade (profiles.id), nunca
    // um split_members.id — resolve pelo Telegram, null se a pessoa nunca
    // conectou o Telegram pessoal dela a nenhuma carteira.
    const createdBy = await resolveUserIdForTelegram(cq.from.id);

    if (pending.kind === 'despesa') {
      const p = pending.payload as {
        description: string; amountCents: number; dateISO: string; paidBy: string; participantIds: string[];
      };
      await createSplitExpense(pending.groupId, {
        description: p.description, amountCents: p.amountCents, paidBy: p.paidBy,
        dateISO: p.dateISO, participantIds: p.participantIds,
      }, createdBy);
      if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
      await answerCallback(cq.id, 'Lançado ✅');
      await sendMessage(chatId, `✅ Despesa registrada: <b>${escapeHtml(p.description)}</b> — ${formatBRL(p.amountCents)}.`);
      return;
    }

    if (pending.kind === 'acerto') {
      const p = pending.payload as { fromMember: string; toMember: string; amountCents: number; dateISO: string };
      await createSplitPayment(pending.groupId, p.fromMember, p.toMember, p.amountCents, p.dateISO, null, createdBy);
      if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
      await answerCallback(cq.id, 'Registrado ✅');
      await sendMessage(chatId, `✅ Acerto registrado — ${formatBRL(p.amountCents)}.`);
      return;
    }

    await answerCallback(cq.id);
  } catch (e) {
    await answerCallback(cq.id, 'Erro');
    await sendMessage(chatId, `❌ ${escapeHtml((e as Error).message)}`);
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
  // mostra a MESMA conta que o insertEntry vai usar (conta citada, senão a 1ª
  // de dinheiro) — receita nunca fica no cartão, mesmo que tenha vindo com um
  // accountId de cartão (a IA às vezes chuta errado); nesse caso trata como
  // "não identifiquei" pra avisar e deixar a pessoa corrigir.
  const requestedAcc = e.accountId ? bundle.accounts.find((a) => a.id === e.accountId) : null;
  const accountIdInvalid = e.kind === 'income' && requestedAcc?.kind === 'card';
  const chosenAcc = (requestedAcc && !accountIdInvalid ? requestedAcc : null)
    || bundle.accounts.find((a) => a.kind !== 'card' && !a.archived);
  const accName = chosenAcc?.name ?? 'conta principal';
  const catName = e.categoryId ? bundle.categories.find((c) => c.id === e.categoryId)?.name : null;
  const tipo = e.kind === 'income' ? '📥 Entrada' : '🧾 Saída';
  const extra = [
    e.installments && e.installments > 1 ? `${e.installments}×` : null,
    e.shared ? 'em conjunto' : null,
  ].filter(Boolean).join(' · ');

  const missingAcc = !e.accountId || accountIdInvalid;
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

/** Agrupa itens em pares por linha, pro teclado inline do Telegram. */
function pairUp(buttons: InlineButton[]): InlineButton[][] {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

/**
 * Mostra botões pra escolher a conta (se faltar) ou a categoria (se a conta
 * já estiver definida mas a categoria não) — evita depender só do texto
 * livre, que fica ambíguo quando duas contas têm nome parecido.
 */
async function promptComplementPicker(link: ChatLink, chatId: number, entry: BotEntry): Promise<void> {
  await setPending(link.id, 'complement_tx', { entry });
  const bundle = await loadWalletBundle(link.wallet_id);

  if (!entry.accountId) {
    // receita não pode ir pro cartão (não existe "receber na fatura")
    const accounts = bundle.accounts.filter((a) => !a.archived && (entry.kind !== 'income' || a.kind !== 'card'));
    if (accounts.length > 0) {
      await sendMessage(chatId, '🏦 Qual conta? (ou responda com o nome)',
        pairUp(accounts.map((a) => ({ text: a.name, callback_data: `accsel:${a.id}` }))));
      return;
    }
  }

  const categories = bundle.categories.filter((c) => c.kind === entry.kind);
  if (!entry.categoryId && categories.length > 0) {
    await sendMessage(chatId, '🏷️ Qual categoria? (ou responda com o nome, ou toque em Confirmar sem categoria)',
      pairUp(categories.map((c) => ({ text: c.name, callback_data: `catsel:${c.id}` }))));
    return;
  }

  await promptLancamento(link, chatId, entry);
}

/** Acha, entre `items`, o de nome mais específico (mais longo) citado em `text`. */
function matchByName<T extends { id: string; name: string }>(text: string, items: T[]): T | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  const t = norm(text);
  const tWords = new Set(words(text));

  const scored = items
    .filter((it) => it.name)
    .map((it) => {
      const nameNorm = norm(it.name);
      // "Nubank" digitado deve achar a conta "Nubank Ellen" (e vice-versa) —
      // por isso confere as duas direções, não só texto-contém-nome.
      const fullMatch = t.includes(nameNorm) || nameNorm.includes(t);
      const wordHits = words(it.name).filter((w) => tWords.has(w)).length;
      return { it, fullMatch, wordHits };
    })
    .filter((s) => s.fullMatch || s.wordHits > 0)
    .sort((a, b) => {
      if (a.fullMatch !== b.fullMatch) return a.fullMatch ? -1 : 1;
      if (b.wordHits !== a.wordHits) return b.wordHits - a.wordHits;
      return b.it.name.length - a.it.name.length;
    });

  return scored[0]?.it ?? null;
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
          (r.parts > 1 ? ` em ${r.parts}×` : '') + (r.onCard && entry.kind !== 'income' ? ' (na fatura)' : ''));
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
    if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
    await answerCallback(cq.id);
    await promptComplementPicker(link, chatId, (p.payload as { entry: BotEntry }).entry);
    return;
  }

  if (action === 'accsel' && a1) {
    const p = await takePending(link.id);
    if (!p || p.kind !== 'complement_tx') { await answerCallback(cq.id, 'Esse pedido expirou.'); return; }
    const entry = { ...(p.payload as { entry: BotEntry }).entry, accountId: a1 };
    if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
    await answerCallback(cq.id, 'Conta escolhida ✅');
    await promptComplementPicker(link, chatId, entry);
    return;
  }

  if (action === 'catsel' && a1) {
    const p = await takePending(link.id);
    if (!p || p.kind !== 'complement_tx') { await answerCallback(cq.id, 'Esse pedido expirou.'); return; }
    const entry = { ...(p.payload as { entry: BotEntry }).entry, categoryId: a1 };
    if (msgId) await clearButtons(chatId, msgId).catch(() => undefined);
    await answerCallback(cq.id, 'Categoria escolhida ✅');
    await promptLancamento(link, chatId, entry);
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
