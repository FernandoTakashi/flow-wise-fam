// Interpreta uma mensagem de texto ("ifood 42,90 crédito nubank") num lançamento
// estruturado. Usa Claude Haiku quando há ANTHROPIC_API_KEY; senão cai num
// parser por regex (formato: "descrição valor [resto ignorado]").
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { env } from './env.ts';
import { toCents } from '../../src/lib/money.ts';

export interface ParseContext {
  todayISO: string;
  accounts: { id: string; name: string; kind: string }[];
  categories: { id: string; name: string; kind: string }[];
}

export interface ParsedEntry {
  understood: boolean;
  kind: 'expense' | 'income';
  description: string;
  amountCents: number;
  accountId: string | null;
  categoryId: string | null;
  dateISO: string;
  note: string | null;
}

const Schema = z.object({
  understood: z.boolean().describe('true se a mensagem descreve um gasto ou recebimento com valor'),
  kind: z.enum(['expense', 'income']),
  description: z.string().describe('descrição curta, ex: "iFood", "Mercado", "Salário"'),
  amount_cents: z.number().int().positive().describe('valor em centavos inteiros'),
  account_id: z.string().nullable().describe('id EXATO de uma conta da lista, ou null se não citada'),
  category_id: z.string().nullable().describe('id EXATO de uma categoria da lista, ou null'),
  date: z.string().describe('data no formato yyyy-mm-dd; use hoje se não citada'),
  note: z.string().nullable(),
});

function regexFallback(text: string, ctx: ParseContext): ParsedEntry {
  const m = text.match(/^(.*?)[\s:]*([\d.]+,\d{2}|\d+[.,]\d{1,2}|\d+)\s*(.*)$/);
  if (!m) {
    return {
      understood: false, kind: 'expense', description: text.trim().slice(0, 60),
      amountCents: 0, accountId: null, categoryId: null, dateISO: ctx.todayISO, note: null,
    };
  }
  const desc = m[1].trim() || 'Lançamento';
  const cents = toCents(m[2]);
  return {
    understood: cents > 0,
    kind: 'expense',
    description: desc.charAt(0).toUpperCase() + desc.slice(1),
    amountCents: cents,
    accountId: null,
    categoryId: null,
    dateISO: ctx.todayISO,
    note: null,
  };
}

export async function parseEntry(text: string, ctx: ParseContext): Promise<ParsedEntry> {
  const key = env.anthropicKey();
  if (!key) return regexFallback(text, ctx);

  try {
    const client = new Anthropic({ apiKey: key });
    const accountsList = ctx.accounts.map((a) => `- ${a.id} :: ${a.name} (${a.kind})`).join('\n');
    const categoriesList = ctx.categories.map((c) => `- ${c.id} :: ${c.name} (${c.kind})`).join('\n');

    const response = await client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system:
        'Você extrai um lançamento financeiro pessoal (pt-BR) de uma frase curta. ' +
        'Responda SÓ com o schema. "understood" é false se não houver valor monetário claro. ' +
        'Escolha account_id/category_id apenas se a conta/categoria estiver claramente citada, ' +
        'usando o id EXATO das listas; senão null. Datas relativas ("ontem", "sexta") ' +
        `viram yyyy-mm-dd tendo hoje = ${ctx.todayISO}.`,
      messages: [
        {
          role: 'user',
          content:
            `CONTAS:\n${accountsList || '(nenhuma)'}\n\n` +
            `CATEGORIAS:\n${categoriesList || '(nenhuma)'}\n\n` +
            `MENSAGEM:\n${text}`,
        },
      ],
      output_config: { format: zodOutputFormat(Schema) },
    });

    const p = response.parsed_output;
    if (!p) return regexFallback(text, ctx);

    const validAccount = p.account_id && ctx.accounts.some((a) => a.id === p.account_id) ? p.account_id : null;
    const validCategory = p.category_id && ctx.categories.some((c) => c.id === p.category_id) ? p.category_id : null;
    const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : ctx.todayISO;

    return {
      understood: p.understood && p.amount_cents > 0,
      kind: p.kind,
      description: p.description.trim().slice(0, 80) || 'Lançamento',
      amountCents: p.amount_cents,
      accountId: validAccount,
      categoryId: validCategory,
      dateISO,
      note: p.note?.trim() || null,
    };
  } catch {
    return regexFallback(text, ctx);
  }
}
