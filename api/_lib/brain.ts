// "Cérebro" do bot: uma chamada ao Haiku decide o que a mensagem quer —
// responder uma pergunta, registrar um lançamento, ou marcar um fixo pago.
// Sem ANTHROPIC_API_KEY cai num modo simples (regex p/ lançamento).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { env } from './env.js';
import { toCents } from './shared.js';
import type { WalletContext } from './context.js';

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
        'account_id/category_id = null se não citado; datas relativas viram yyyy-mm-dd com hoje = ' + ctx.hoje + ').\n' +
        '- "pagar_fixo": a pessoa diz que pagou/recebeu uma conta fixa (ex.: "paguei o aluguel"). Preencha `pay` com o recurrence_id do fixo correspondente em fixosAPagar/fixosAReceber.\n' +
        '- "pagar_fatura": a pessoa diz que pagou a fatura de um cartão (ex.: "paguei a fatura do nubank"). Preencha `fatura` com o cartaoId (de `faturas`) e a conta de onde saiu o dinheiro (de `contasParaLancar`, tipo diferente de "card").\n' +
        '- "criar_fixo": a pessoa quer CADASTRAR uma conta fixa nova, sem estar pagando agora (ex.: "cadastra academia 89,90 todo dia 10", "todo mês recebo 200 de aluguel no dia 5"). Preencha `fixo`. NÃO confundir com "lancamento" (que é um gasto avulso de agora) nem com "pagar_fixo" (que já existe e a pessoa está dando baixa).\n' +
        '- "desfazer": a pessoa quer desfazer/cancelar/apagar o último lançamento que ela fez (ex.: "desfaz", "cancela isso", "lancei errado, apaga"). Não precisa preencher nada extra — o último lançamento é resolvido fora daqui.\n' +
        '- "ajuda"/"desconhecido": responda em `reply` explicando o que sabe fazer.',
      messages: [{ role: 'user', content: `ESTADO:\n${JSON.stringify(ctx)}\n\nMENSAGEM:\n${text}` }],
      output_config: { format: zodOutputFormat(Schema) },
    });

    const p = response.parsed_output;
    if (!p) throw new Error('sem parsed_output');

    if (p.intent === 'lancamento' && p.entry && p.entry.amount_cents > 0) {
      const acc = p.entry.account_id && ctx.contasParaLancar.some((a) => a.id === p.entry!.account_id) ? p.entry.account_id : null;
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
      const acc = p.fixo.account_id && ctx.contasParaLancar.some((a) => a.id === p.fixo!.account_id) ? p.fixo.account_id : null;
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
