// "Cérebro" do bot: uma chamada ao Haiku decide o que a mensagem quer —
// responder uma pergunta, registrar um lançamento, ou marcar um fixo pago.
// Sem ANTHROPIC_API_KEY cai num modo simples (regex p/ lançamento).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { env } from './env.js';
import { toCents } from './shared.js';
import type { WalletContext } from './context.js';
import type { SplitGroupContext } from './splitContext.js';
import type { ImageMediaType } from './telegram.js';

function anthropic(): Anthropic {
  const wsId = env.anthropicWorkspaceId();
  return new Anthropic({
    apiKey: env.anthropicKey()!,
    ...(wsId ? { defaultHeaders: { 'anthropic-workspace-id': wsId } } : {}),
  });
}

export interface BotEntry {
  kind: 'expense' | 'income';
  description: string;
  amountCents: number;
  accountId: string | null;
  categoryId: string | null;
  dateISO: string;
  installments: number | null;
  shared: boolean;
  note: string | null;
}

export interface BotFixo {
  description: string;
  kind: 'income' | 'expense';
  amountCents: number;
  day: number;
  accountId: string | null;
  categoryId: string | null;
}

export type BotAction =
  | { intent: 'reply'; text: string }
  | { intent: 'lancamento'; entry: BotEntry }
  | { intent: 'pagar_fixo'; recurrenceId: string; amountCents: number | null; paidOnISO: string | null }
  | { intent: 'pagar_fatura'; cardId: string; fromAccountId: string; paidOnISO: string | null }
  | { intent: 'criar_fixo'; fixo: BotFixo }
  | { intent: 'desfazer' };

const Schema = z.object({
  intent: z.enum(['consulta', 'lancamento', 'pagar_fixo', 'pagar_fatura', 'criar_fixo', 'desfazer', 'ajuda', 'desconhecido']),
  reply: z.string().describe('Resposta pronta em pt-BR (consulta/ajuda/desconhecido). Curta, com os números do contexto. Vazio pros outros intents.'),
  entry: z.object({
    kind: z.enum(['expense', 'income']),
    description: z.string(),
    amount_cents: z.number().int(),
    account_id: z.string().nullable().describe('id EXATO de contasParaLancar, ou null'),
    category_id: z.string().nullable().describe('id EXATO de categorias, ou null'),
    date: z.string().describe('yyyy-mm-dd'),
    installments: z.number().int().nullable().describe('nº de parcelas se citado (só cartão), senão null'),
    shared: z.boolean().nullable().describe('true se foi um gasto "em conjunto" / dos dois juntos (não divide contas, só marca)'),
    note: z.string().nullable(),
  }).nullable(),
  pay: z.object({
    recurrence_id: z.string().describe('id EXATO de fixosAPagar/fixosAReceber'),
    amount_cents: z.number().int().nullable(),
    paid_on: z.string().nullable().describe('yyyy-mm-dd, senão null (= hoje)'),
  }).nullable(),
  fatura: z.object({
    card_id: z.string().describe('cartaoId EXATO de faturas'),
    from_account_id: z.string().describe('id EXATO de contasParaLancar cujo tipo NÃO seja "card" — de onde sai o dinheiro'),
    paid_on: z.string().nullable().describe('yyyy-mm-dd, senão null (= hoje)'),
  }).nullable(),
  fixo: z.object({
    description: z.string(),
    kind: z.enum(['expense', 'income']),
    amount_cents: z.number().int(),
    day: z.number().int().describe('1-31 = dia fixo do mês; 0 = último dia do mês'),
    account_id: z.string().nullable().describe('id EXATO de contasParaLancar, ou null'),
    category_id: z.string().nullable().describe('id EXATO de categorias, ou null'),
  }).nullable(),
});

function regexEntry(text: string, todayISO: string): BotEntry | null {
  const mm = text.match(/^(.*?)[\s:]*([\d.]+,\d{2}|\d+[.,]\d{1,2}|\d+)\s*(.*)$/);
  if (!mm) return null;
  const cents = toCents(mm[2]);
  if (cents <= 0) return null;
  const desc = (mm[1].trim() || 'Lançamento');
  return {
    kind: 'expense', description: desc.charAt(0).toUpperCase() + desc.slice(1), amountCents: cents,
    accountId: null, categoryId: null, dateISO: todayISO, installments: null, shared: false,
    note: mm[3].trim() || null,
  };
}

export async function interpret(text: string, ctx: WalletContext): Promise<BotAction> {
  const key = env.anthropicKey();
  if (!key) {
    const e = regexEntry(text, ctx.hoje);
    return e ? { intent: 'lancamento', entry: e }
      : { intent: 'reply', text: 'Configure ANTHROPIC_API_KEY para eu entender perguntas. Por enquanto: "mercado 87,50 nubank".' };
  }

  try {
    const client = anthropic();
    const response = await client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 900,
      system:
        'Você é a Carolina, assistente da CaRe Wallet — carteira financeira da família (pt-BR), no Telegram. ' +
        'Recebe UMA mensagem do usuário e o ESTADO ATUAL da carteira (JSON). Classifique em intent e responda no schema.\n' +
        '- "consulta": pergunta sobre dinheiro (saldo, quanto gastei/recebi, o que falta pagar, fatura, últimos gastos). ' +
        'Responda em `reply`, curto e direto, usando SÓ os números do estado. Se o estado não tem a resposta, diga isso.\n' +
        '- "lancamento": a mensagem descreve um gasto ou recebimento com valor. Preencha `entry` (ids EXATOS das listas; ' +
        'account_id/category_id = null se não citado; datas relativas viram yyyy-mm-dd com hoje = ' + ctx.hoje + '). ' +
        'Se kind="income", account_id NUNCA pode ser uma conta do tipo "card" — não existe receber na fatura de um cartão; ' +
        'se a pessoa citou um cartão pra um recebimento, deixe account_id null.\n' +
        '- "pagar_fixo": a pessoa diz que pagou/recebeu uma conta fixa (ex.: "paguei o aluguel"). Preencha `pay` com o recurrence_id do fixo correspondente em fixosAPagar/fixosAReceber.\n' +
        '- "pagar_fatura": a pessoa diz que pagou a fatura de um cartão (ex.: "paguei a fatura do nubank"). Preencha `fatura` com o cartaoId (de `faturas`) e a conta de onde saiu o dinheiro (de `contasParaLancar`, tipo diferente de "card").\n' +
        '- "criar_fixo": a pessoa quer CADASTRAR uma conta fixa nova, sem estar pagando agora (ex.: "cadastra academia 89,90 todo dia 10", "todo mês recebo 200 de aluguel no dia 5"). Preencha `fixo` (mesma regra do lançamento: kind="income" nunca leva account_id de cartão). NÃO confundir com "lancamento" (que é um gasto avulso de agora) nem com "pagar_fixo" (que já existe e a pessoa está dando baixa).\n' +
        '- "desfazer": a pessoa quer desfazer/cancelar/apagar o último lançamento que ela fez (ex.: "desfaz", "cancela isso", "lancei errado, apaga"). Não precisa preencher nada extra — o último lançamento é resolvido fora daqui.\n' +
        '- "ajuda"/"desconhecido": responda em `reply` explicando o que sabe fazer.',
      messages: [{ role: 'user', content: `ESTADO:\n${JSON.stringify(ctx)}\n\nMENSAGEM:\n${text}` }],
      output_config: { format: zodOutputFormat(Schema) },
    });

    const p = response.parsed_output;
    if (!p) throw new Error('sem parsed_output');

    if (p.intent === 'lancamento' && p.entry && p.entry.amount_cents > 0) {
      // receita nunca numa conta tipo "card" — mesmo que o modelo erre isso
      // apesar da instrução acima, não deixa passar pro schema.
      const accMatch = p.entry.account_id ? ctx.contasParaLancar.find((a) => a.id === p.entry!.account_id) : null;
      const acc = accMatch && !(p.entry.kind === 'income' && accMatch.tipo === 'card') ? accMatch.id : null;
      const cat = p.entry.category_id && ctx.categorias.some((c) => c.id === p.entry!.category_id) ? p.entry.category_id : null;
      return {
        intent: 'lancamento',
        entry: {
          kind: p.entry.kind,
          description: p.entry.description.trim().slice(0, 80) || 'Lançamento',
          amountCents: p.entry.amount_cents,
          accountId: acc,
          categoryId: cat,
          dateISO: /^\d{4}-\d{2}-\d{2}$/.test(p.entry.date) ? p.entry.date : ctx.hoje,
          installments: p.entry.installments && p.entry.installments > 1 ? p.entry.installments : null,
          shared: p.entry.shared === true,
          note: p.entry.note?.trim() || null,
        },
      };
    }

    if (p.intent === 'pagar_fixo' && p.pay?.recurrence_id) {
      const known = [...ctx.fixosAPagar, ...ctx.fixosAReceber].some((f) => f.recurrenceId === p.pay!.recurrence_id);
      if (known) {
        return {
          intent: 'pagar_fixo',
          recurrenceId: p.pay.recurrence_id,
          amountCents: p.pay.amount_cents && p.pay.amount_cents > 0 ? p.pay.amount_cents : null,
          paidOnISO: p.pay.paid_on && /^\d{4}-\d{2}-\d{2}$/.test(p.pay.paid_on) ? p.pay.paid_on : null,
        };
      }
    }

    if (p.intent === 'pagar_fatura' && p.fatura?.card_id && p.fatura?.from_account_id) {
      const cardOk = ctx.faturas.some((f) => f.cartaoId === p.fatura!.card_id);
      const accOk = ctx.contasParaLancar.some((a) => a.id === p.fatura!.from_account_id && a.tipo !== 'card');
      if (cardOk && accOk) {
        return {
          intent: 'pagar_fatura',
          cardId: p.fatura.card_id,
          fromAccountId: p.fatura.from_account_id,
          paidOnISO: p.fatura.paid_on && /^\d{4}-\d{2}-\d{2}$/.test(p.fatura.paid_on) ? p.fatura.paid_on : null,
        };
      }
    }

    if (p.intent === 'criar_fixo' && p.fixo && p.fixo.amount_cents > 0) {
      // mesma regra do lançamento avulso: fixo de receita nunca no cartão
      const fixoAccMatch = p.fixo.account_id ? ctx.contasParaLancar.find((a) => a.id === p.fixo!.account_id) : null;
      const acc = fixoAccMatch && !(p.fixo.kind === 'income' && fixoAccMatch.tipo === 'card') ? fixoAccMatch.id : null;
      const cat = p.fixo.category_id && ctx.categorias.some((c) => c.id === p.fixo!.category_id) ? p.fixo.category_id : null;
      return {
        intent: 'criar_fixo',
        fixo: {
          description: p.fixo.description.trim().slice(0, 80) || 'Fixo',
          kind: p.fixo.kind,
          amountCents: p.fixo.amount_cents,
          day: Math.min(Math.max(p.fixo.day, 0), 31),
          accountId: acc,
          categoryId: cat,
        },
      };
    }

    if (p.intent === 'desfazer') return { intent: 'desfazer' };

    return { intent: 'reply', text: p.reply?.trim() || 'Não entendi. Manda um gasto ("uber 23 nubank") ou uma pergunta ("qual meu saldo?").' };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error('[brain] parse falhou:', msg);

    // lançamento óbvio → regex
    const en = regexEntry(text, ctx.hoje);
    if (en) return { intent: 'lancamento', entry: en };

    // plano B: resposta em texto puro (sem output estruturado)
    try {
      const client = anthropic();
      const r = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system: 'Você é a Carolina, assistente da CaRe Wallet (pt-BR) no Telegram. Responda curto e direto usando SÓ os números do ESTADO. Se o ESTADO não tem a resposta, diga isso.',
        messages: [{ role: 'user', content: `ESTADO:\n${JSON.stringify(ctx)}\n\nPERGUNTA:\n${text}` }],
      });
      const t = r.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
      if (t) return { intent: 'reply', text: t };
    } catch (e2) {
      console.error('[brain] plano B falhou:', (e2 as Error).message ?? e2);
      return { intent: 'reply', text: `⚠️ Erro ao chamar o Haiku: ${msg}` };
    }
    return { intent: 'reply', text: `⚠️ Não consegui pensar nisso. (${msg})` };
  }
}

const ImageSchema = z.object({
  found: z.boolean().describe('true se a imagem é um comprovante/recibo de pagamento com valor legível'),
  entry: z.object({
    kind: z.enum(['expense', 'income']),
    description: z.string().describe('estabelecimento/pra quem foi, curto'),
    amount_cents: z.number().int(),
    account_id: z.string().nullable().describe('id EXATO de contasParaLancar — só se o nome do banco/cartão do comprovante bater com uma conta da lista, senão null'),
    category_id: z.string().nullable().describe('id EXATO de categorias, ou null'),
    date: z.string().describe('yyyy-mm-dd — a data do comprovante, se legível; senão hoje'),
    note: z.string().nullable(),
  }).nullable(),
  reply: z.string().describe('se found=false, explica objetivamente o que não deu pra ler (pouca luz, cortado, não parece comprovante...); se found=true, deixe vazio'),
});

/** Lê uma foto de comprovante/recibo (PIX, cartão, boleto) e tenta extrair um lançamento. */
export async function interpretImage(
  imageBase64: string, mediaType: ImageMediaType, ctx: WalletContext, caption?: string,
): Promise<BotAction> {
  const key = env.anthropicKey();
  if (!key) {
    return { intent: 'reply', text: 'Configure ANTHROPIC_API_KEY pra eu ler fotos de comprovante. Por enquanto, manda o valor em texto.' };
  }

  try {
    const client = anthropic();
    const response = await client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      system:
        'Você é a Carolina, assistente da CaRe Wallet (pt-BR), no Telegram. ' +
        'A pessoa mandou uma FOTO de um comprovante/recibo (PIX, cartão, boleto pago, nota fiscal). ' +
        'Extraia o gasto/recebimento pro schema. Regras:\n' +
        '- amount_cents = valor total, em centavos.\n' +
        '- description = nome do estabelecimento/pra quem foi (não invente; use o que está escrito).\n' +
        '- account_id: só preencha se o nome do banco/instituição no comprovante bater claramente com o nome de uma conta em contasParaLancar; senão null.\n' +
        '- category_id: tente adivinhar pela descrição, usando o id EXATO de categorias; senão null.\n' +
        '- date: use a data do comprovante se estiver legível (yyyy-mm-dd); senão ' + ctx.hoje + '.\n' +
        '- Se a legenda da foto (se houver) der uma pista (ex.: categoria, "foi em conjunto"), use-a.\n' +
        '- Se a imagem não for um comprovante legível, found=false e explique objetivamente por quê em `reply`.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: `ESTADO:\n${JSON.stringify(ctx)}${caption ? `\n\nLEGENDA DA FOTO:\n${caption}` : ''}` },
        ],
      }],
      output_config: { format: zodOutputFormat(ImageSchema) },
    });

    const p = response.parsed_output;
    if (!p) throw new Error('sem parsed_output');

    if (p.found && p.entry && p.entry.amount_cents > 0) {
      const imgAccMatch = p.entry.account_id ? ctx.contasParaLancar.find((a) => a.id === p.entry!.account_id) : null;
      const acc = imgAccMatch && !(p.entry.kind === 'income' && imgAccMatch.tipo === 'card') ? imgAccMatch.id : null;
      const cat = p.entry.category_id && ctx.categorias.some((c) => c.id === p.entry!.category_id) ? p.entry.category_id : null;
      return {
        intent: 'lancamento',
        entry: {
          kind: p.entry.kind,
          description: p.entry.description.trim().slice(0, 80) || 'Comprovante',
          amountCents: p.entry.amount_cents,
          accountId: acc,
          categoryId: cat,
          dateISO: /^\d{4}-\d{2}-\d{2}$/.test(p.entry.date) ? p.entry.date : ctx.hoje,
          installments: null,
          shared: false,
          note: p.entry.note?.trim() || null,
        },
      };
    }

    return { intent: 'reply', text: p.reply?.trim() || 'Não consegui ler esse comprovante. Manda o valor em texto ou uma foto mais nítida.' };
  } catch (e) {
    console.error('[brain] interpretImage falhou:', (e as Error).message ?? e);
    return { intent: 'reply', text: 'Não consegui ler essa foto agora. Manda o valor em texto, ou tenta de novo.' };
  }
}

// ---------------------------------------------------------------------------
// "Dividir" (grupo do Telegram) — schema, prompt e tipo TOTALMENTE separados
// do modo carteira. Isso não é só organização: o prompt abaixo nem sabe que
// conta, categoria, fatura ou fixo existem — não tem como vazar o que não
// está no vocabulário que o modelo recebe.
// ---------------------------------------------------------------------------

export type BotSplitAction =
  | { intent: 'reply'; text: string }
  | { intent: 'ignorar' }
  | { intent: 'despesa'; description: string; amountCents: number; dateISO: string; participantIds: string[] | null }
  | { intent: 'acerto'; toMemberId: string; amountCents: number; dateISO: string };

const SplitSchema = z.object({
  intent: z.enum(['despesa', 'acerto', 'consulta', 'ajuda', 'ignorar']),
  reply: z.string().describe('Resposta pronta em pt-BR (consulta/ajuda). Curta, com os números do contexto. Vazio pros outros intents.'),
  despesa: z.object({
    description: z.string().describe('o que foi, curto (ex.: "jantar", "uber")'),
    amount_cents: z.number().int(),
    date: z.string().nullable().describe('yyyy-mm-dd, senão null (= hoje)'),
    participant_ids: z.array(z.string()).nullable()
      .describe('ids EXATOS de membros participando, só se a pessoa excluiu alguém explicitamente; null = todo mundo do grupo hoje'),
  }).nullable(),
  acerto: z.object({
    to_member_id: z.string().describe('id EXATO de membros — pra quem o dinheiro foi'),
    amount_cents: z.number().int(),
    date: z.string().nullable(),
  }).nullable(),
});

/**
 * Interpreta uma mensagem de um GRUPO do Telegram ligado a um split_group.
 * `senderName` é só o nome de quem mandou, pro prompt — quem pagou uma
 * despesa é sempre quem mandou a mensagem (v1 não deixa reportar em nome de
 * outra pessoa, evita confusão/spoofing de quem realmente gastou).
 */
export async function interpretSplit(text: string, ctx: SplitGroupContext, senderName: string): Promise<BotSplitAction> {
  const key = env.anthropicKey();
  if (!key) return { intent: 'ignorar' }; // sem IA, o modo grupo simplesmente não responde (não tem regex razoável aqui)

  try {
    const client = anthropic();
    const response = await client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      system:
        'Você é a Carolina, assistente de divisão de despesas em grupo (pt-BR), num grupo do Telegram chamado "' + ctx.grupo + '". ' +
        'Isso é SÓ sobre dividir gasto em grupo — você não tem acesso a nenhuma carteira pessoal, conta bancária, fatura ou fixo de ninguém, ' +
        'e se alguém perguntar sobre isso, use intent "consulta" e responda em `reply` que isso não existe aqui, ' +
        'só as despesas deste grupo (pra ver a carteira pessoal, é no chat privado).\n' +
        `Quem mandou esta mensagem: ${senderName}. Membros do grupo (JSON): ${JSON.stringify(ctx.membros)}. Hoje: usar a data de hoje quando não citada.\n` +
        'Classifique a mensagem:\n' +
        `- "despesa": ${senderName} está reportando um gasto que ELE fez (ex.: "paguei o jantar, 180", "gastei 40 no uber"). ` +
        'Preencha `despesa`. participant_ids só se alguém foi excluído explicitamente ("menos o Bruno", "só eu e a Ana") — senão null (todo mundo).\n' +
        `- "acerto": ${senderName} diz que PAGOU outra pessoa do grupo pra acertar uma dívida (ex.: "paguei os 40 pra Ana", "já acertei com o Bruno"). ` +
        'Preencha `acerto` com o id EXATO de quem recebeu.\n' +
        '- "consulta": pergunta sobre o saldo/quem deve quem/despesas do grupo. Responda em `reply` usando só os números do estado abaixo.\n' +
        '- "ajuda": perguntou o que você faz aqui. Responda em `reply`.\n' +
        '- "ignorar": QUALQUER outra coisa — conversa do grupo que não é sobre dividir despesa (a grande maioria das mensagens vai cair aqui). ' +
        'Prefira "ignorar" quando tiver dúvida — é MUITO pior interromper uma conversa normal do que deixar passar uma pergunta.',
      messages: [{ role: 'user', content: `ESTADO DO GRUPO:\n${JSON.stringify(ctx)}\n\nMENSAGEM:\n${text}` }],
      output_config: { format: zodOutputFormat(SplitSchema) },
    });

    const p = response.parsed_output;
    if (!p) return { intent: 'ignorar' };

    if (p.intent === 'despesa' && p.despesa && p.despesa.amount_cents > 0) {
      const ids = p.despesa.participant_ids?.filter((id) => ctx.membros.some((m) => m.id === id)) ?? null;
      return {
        intent: 'despesa',
        description: p.despesa.description.trim().slice(0, 80) || 'Despesa',
        amountCents: p.despesa.amount_cents,
        dateISO: p.despesa.date && /^\d{4}-\d{2}-\d{2}$/.test(p.despesa.date) ? p.despesa.date : todayFallback(),
        participantIds: ids && ids.length > 0 ? ids : null,
      };
    }

    if (p.intent === 'acerto' && p.acerto?.to_member_id && p.acerto.amount_cents > 0) {
      if (ctx.membros.some((m) => m.id === p.acerto!.to_member_id)) {
        return {
          intent: 'acerto',
          toMemberId: p.acerto.to_member_id,
          amountCents: p.acerto.amount_cents,
          dateISO: p.acerto.date && /^\d{4}-\d{2}-\d{2}$/.test(p.acerto.date) ? p.acerto.date : todayFallback(),
        };
      }
    }

    if (p.intent === 'consulta' || p.intent === 'ajuda') {
      return { intent: 'reply', text: p.reply?.trim() || 'Não achei essa informação no grupo.' };
    }

    return { intent: 'ignorar' };
  } catch (e) {
    console.error('[brain] interpretSplit falhou:', (e as Error).message ?? e);
    return { intent: 'ignorar' }; // erro no modo grupo nunca deve virar spam de mensagem de erro pro grupo inteiro
  }
}

const SplitImageSchema = z.object({
  found: z.boolean().describe('true se a imagem é uma nota fiscal/recibo/comprovante com valor legível'),
  despesa: z.object({
    description: z.string().describe('estabelecimento, curto (ex.: "restaurante", "mercado")'),
    amount_cents: z.number().int(),
    date: z.string().describe('yyyy-mm-dd — data do comprovante, se legível; senão hoje'),
    participant_ids: z.array(z.string()).nullable()
      .describe('ids EXATOS de membros participando, só se a legenda da foto excluiu alguém explicitamente; null = todo mundo do grupo hoje'),
  }).nullable(),
  reply: z.string().describe('se found=false, explica objetivamente o que não deu pra ler; senão vazio'),
});

/**
 * Lê uma foto de nota fiscal/comprovante mandada num GRUPO do Dividir. Quem
 * pagou é sempre quem mandou a foto (mesma regra do texto) — a legenda (se
 * tiver) é o único jeito de excluir alguém da divisão, já que não tem como
 * "conversar" sobre uma imagem.
 */
export async function interpretSplitImage(
  imageBase64: string, mediaType: ImageMediaType, ctx: SplitGroupContext, senderName: string, caption?: string,
): Promise<BotSplitAction> {
  const key = env.anthropicKey();
  if (!key) return { intent: 'reply', text: 'Configure ANTHROPIC_API_KEY pra eu ler foto de nota fiscal. Por enquanto, manda o valor em texto.' };

  try {
    const client = anthropic();
    const response = await client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      system:
        'Você é a Carolina, assistente de divisão de despesas em grupo (pt-BR), num grupo do Telegram chamado "' + ctx.grupo + '". ' +
        `${senderName} mandou uma FOTO de nota fiscal/comprovante — o gasto é sempre dela/dele (quem manda a foto é quem pagou). ` +
        'Extraia pro schema. Regras:\n' +
        '- amount_cents = valor total da nota, em centavos.\n' +
        '- description = nome do estabelecimento (não invente; use o que está escrito).\n' +
        `- date: data do comprovante se legível (yyyy-mm-dd); senão hoje.\n` +
        '- participant_ids: só preencha se a LEGENDA da foto excluir alguém explicitamente ("menos o Bruno", "só eu e a Ana"); senão null (todo mundo do grupo).\n' +
        '- Se a imagem não for uma nota/comprovante legível, found=false e explique objetivamente por quê em `reply`.\n' +
        `Membros do grupo (JSON): ${JSON.stringify(ctx.membros)}.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: `ESTADO DO GRUPO:\n${JSON.stringify(ctx)}${caption ? `\n\nLEGENDA DA FOTO:\n${caption}` : ''}` },
        ],
      }],
      output_config: { format: zodOutputFormat(SplitImageSchema) },
    });

    const p = response.parsed_output;
    if (!p) return { intent: 'ignorar' };

    if (p.found && p.despesa && p.despesa.amount_cents > 0) {
      const ids = p.despesa.participant_ids?.filter((id) => ctx.membros.some((m) => m.id === id)) ?? null;
      return {
        intent: 'despesa',
        description: p.despesa.description.trim().slice(0, 80) || 'Despesa',
        amountCents: p.despesa.amount_cents,
        dateISO: p.despesa.date && /^\d{4}-\d{2}-\d{2}$/.test(p.despesa.date) ? p.despesa.date : todayFallback(),
        participantIds: ids && ids.length > 0 ? ids : null,
      };
    }

    return { intent: 'reply', text: p.reply?.trim() || 'Não consegui ler essa nota. Manda o valor em texto ou uma foto mais nítida.' };
  } catch (e) {
    console.error('[brain] interpretSplitImage falhou:', (e as Error).message ?? e);
    return { intent: 'reply', text: 'Não consegui ler essa foto agora. Manda o valor em texto, ou tenta de novo.' };
  }
}

function todayFallback(): string {
  return new Date().toISOString().slice(0, 10);
}
