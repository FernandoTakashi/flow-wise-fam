import { describe, it, expect } from 'vitest';
import type { Category, CategoryBudget, Investment, Recurrence, Transaction } from '@/types';
import type { FinanceData } from '@/core';
import { computeBudget, fixedIncomeCents, investedCents } from '@/core';

const cat = (o: Partial<Category>): Category => ({
  id: 'c', walletId: 'w', name: 'Categoria', kind: 'expense', icon: null, color: null,
  archived: false, budgetGroup: null, ...o,
});
const budget = (o: Partial<CategoryBudget>): CategoryBudget => ({
  id: 'b', walletId: 'w', categoryId: 'c', amountCents: 0, ...o,
});
const rec = (o: Partial<Recurrence>): Recurrence => ({
  id: 'r', walletId: 'w', description: 'Aluguel', kind: 'expense', amountCents: 100000,
  categoryId: null, accountId: null, day: 10, frequency: 'monthly', startDate: '2026-01-01', endDate: null,
  active: true, autopay: false, variableAmount: false, shared: false,
  installmentsTotal: null, installmentsDone: 0, ...o,
});
const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2), walletId: 'w', accountId: 'a', kind: 'expense',
  amountCents: 0, date: '2026-06-15', refMonth: 6, refYear: 2026, status: 'cleared', description: '',
  categoryId: null, memberId: null, cardInvoiceId: null, recurrenceId: null, occMonth: null, occYear: null,
  installmentGroup: null, installmentNo: null, installmentOf: null, transferPeerId: null, note: null,
  shared: false, createdBy: null, source: 'app', splits: [], ...o,
});
const inv = (o: Partial<Investment>): Investment => ({
  id: 'i', walletId: 'w', memberId: null, description: 'CDB', amountCents: 0, yieldRateBps: 0, date: '2026-06-10', ...o,
});

const base = (o: Partial<FinanceData> = {}): FinanceData => ({
  transactions: [], accounts: [], categories: [], categoryBudgets: [], recurrences: [], invoices: [],
  investments: [], members: [], periodLocks: [], settings: null, today: '2026-06-20', ...o,
});

describe('fixedIncomeCents', () => {
  it('soma só recorrências de entrada ativas no mês, ignora despesas e inativas', () => {
    const d = base({
      recurrences: [
        rec({ id: 'salario', kind: 'income', amountCents: 500000 }),
        rec({ id: 'freela', kind: 'income', amountCents: 80000, active: false }),
        rec({ id: 'aluguel', kind: 'expense', amountCents: 150000 }),
      ],
    });
    expect(fixedIncomeCents(d, 5, 2026)).toBe(500000); // junho
  });
});

describe('investedCents', () => {
  it('soma só investimentos com data dentro do mês', () => {
    const d = base({
      investments: [
        inv({ id: 'i1', amountCents: 30000, date: '2026-06-05' }),
        inv({ id: 'i2', amountCents: 20000, date: '2026-07-01' }),
      ],
    });
    expect(investedCents(d, 5, 2026)).toBe(30000);
  });
});

describe('computeBudget', () => {
  it('categoria com recorrência fixa vira necessidade automaticamente, mesmo sem classificação manual', () => {
    const d = base({
      categories: [cat({ id: 'moradia', budgetGroup: null })],
      recurrences: [
        rec({ id: 'salario', kind: 'income', amountCents: 500000 }),
        rec({ id: 'aluguel', kind: 'expense', amountCents: 150000, categoryId: 'moradia' }),
      ],
      categoryBudgets: [budget({ categoryId: 'moradia', amountCents: 150000 })],
    });
    const b = computeBudget(d, 5, 2026);
    expect(b.categories[0].group).toBe('necessidade');
    expect(b.categories[0].fixed).toBe(true);
    expect(b.necessidadeBudgetCents).toBe(150000);
    expect(b.unclassifiedCount).toBe(0);
  });

  it('categoria sem recorrência e sem grupo manual conta como não classificada', () => {
    const d = base({ categories: [cat({ id: 'combustivel', budgetGroup: null })] });
    const b = computeBudget(d, 5, 2026);
    expect(b.categories[0].group).toBeNull();
    expect(b.unclassifiedCount).toBe(1);
  });

  it('desejo = renda fixa − necessidade − poupança(20%), caso normal', () => {
    const d = base({
      categories: [cat({ id: 'lazer', budgetGroup: 'desejo' })],
      recurrences: [
        rec({ id: 'salario', kind: 'income', amountCents: 500000 }),
        rec({ id: 'aluguel', kind: 'expense', amountCents: 150000, categoryId: 'moradia' }),
      ],
      categoryBudgets: [budget({ categoryId: 'lazer', amountCents: 50000 })],
    });
    const b = computeBudget(d, 5, 2026);
    // renda 500000, necessidade 0 (categoria "moradia" nem existe na lista de categorias aqui — só a recorrência)
    expect(b.poupancaTargetCents).toBe(100000); // 20% de 500000
    expect(b.desejoTargetCents).toBe(400000); // 500000 - 0 - 100000
    expect(b.desejoSqueezed).toBe(false);
  });

  it('necessidade estourando 50% aperta/zera o desejo, sem mexer na meta de poupança', () => {
    const d = base({
      categories: [cat({ id: 'moradia', budgetGroup: null }), cat({ id: 'lazer', budgetGroup: 'desejo' })],
      recurrences: [
        rec({ id: 'salario', kind: 'income', amountCents: 500000 }),
        rec({ id: 'aluguel', kind: 'expense', amountCents: 350000, categoryId: 'moradia' }), // 70% da renda
      ],
      categoryBudgets: [budget({ categoryId: 'moradia', amountCents: 350000 }), budget({ categoryId: 'lazer', amountCents: 50000 })],
    });
    const b = computeBudget(d, 5, 2026);
    // 500000 - 350000 (necessidade) - 100000 (poupança 20%) = 50000 ainda sobra pro desejo
    expect(b.poupancaTargetCents).toBe(100000);
    expect(b.desejoTargetCents).toBe(50000);
    expect(b.desejoSqueezed).toBe(false);

    // agora necessidade ainda maior: nem sobra pro desejo
    const d2 = base({
      ...d,
      categoryBudgets: [budget({ categoryId: 'moradia', amountCents: 420000 }), budget({ categoryId: 'lazer', amountCents: 50000 })],
    });
    const b2 = computeBudget(d2, 5, 2026);
    expect(b2.desejoTargetCents).toBe(0);
    expect(b2.desejoSqueezed).toBe(true);
    expect(b2.poupancaTargetCents).toBe(100000); // meta de poupança intacta
  });

  it('gasto do mês soma só transações com ref_month/ref_year batendo', () => {
    const d = base({
      categories: [cat({ id: 'mercado', budgetGroup: 'necessidade' })],
      transactions: [
        tx({ categoryId: 'mercado', amountCents: 40000, refMonth: 6, refYear: 2026 }),
        tx({ categoryId: 'mercado', amountCents: 99999, refMonth: 5, refYear: 2026 }),
      ],
    });
    const b = computeBudget(d, 5, 2026);
    expect(b.categories[0].spentCents).toBe(40000);
    expect(b.necessidadeSpentCents).toBe(40000);
  });

  it('orçamento salvo sobrepõe a sugestão da média; sem orçamento salvo, usa a sugestão', () => {
    const d = base({
      categories: [cat({ id: 'combustivel', budgetGroup: 'necessidade' })],
      transactions: [
        tx({ categoryId: 'combustivel', amountCents: 20000, refMonth: 5, refYear: 2026 }),
        tx({ categoryId: 'combustivel', amountCents: 30000, refMonth: 4, refYear: 2026 }),
      ],
    });
    // junho — soma abr+mai+mar (mar sem lançamento) / 3, não só a média dos meses com lançamento
    const b = computeBudget(d, 5, 2026);
    expect(b.categories[0].suggestedCents).toBe(16667); // (20000+30000+0)/3
    expect(b.categories[0].budgetCents).toBe(16667); // sem budget salvo, cai na sugestão

    const d2 = base({ ...d, categoryBudgets: [budget({ categoryId: 'combustivel', amountCents: 35000 })] });
    const b2 = computeBudget(d2, 5, 2026);
    expect(b2.categories[0].budgetCents).toBe(35000);
  });

  it('gasto esporádico (1 mês em 3) não vira sugestão do valor cheio — divide sempre por 3', () => {
    const d = base({
      categories: [cat({ id: 'seguro', budgetGroup: 'necessidade' })],
      transactions: [
        // seguro anual pago uma única vez nos últimos 3 meses
        tx({ categoryId: 'seguro', amountCents: 300000, refMonth: 4, refYear: 2026 }),
      ],
    });
    const b = computeBudget(d, 5, 2026); // junho
    expect(b.categories[0].suggestedCents).toBe(100000); // 300000 / 3, não 300000 cheio
  });

  it('lançamento com budgetGroup sobrescreve o padrão da categoria só pra ele', () => {
    const d = base({
      categories: [cat({ id: 'transporte', budgetGroup: 'necessidade' })],
      transactions: [
        // corrida pro trabalho: segue o padrão da categoria (necessidade)
        tx({ categoryId: 'transporte', amountCents: 3000, refMonth: 6, refYear: 2026 }),
        // corrida de balada: marcada como desejo, mesmo a categoria sendo necessidade
        tx({ categoryId: 'transporte', amountCents: 5000, refMonth: 6, refYear: 2026, budgetGroup: 'desejo' }),
      ],
    });
    const b = computeBudget(d, 5, 2026);
    // o total da categoria continua somando tudo...
    expect(b.categories[0].spentCents).toBe(8000);
    // ...mas o gasto por grupo respeita a exceção
    expect(b.necessidadeSpentCents).toBe(3000);
    expect(b.desejoSpentCents).toBe(5000);
  });

  it('categoria fixa usa o valor da recorrência como sugestão, não a média do histórico real', () => {
    const d = base({
      categories: [cat({ id: 'internet', budgetGroup: null })],
      recurrences: [
        rec({ id: 'net', kind: 'expense', amountCents: 12000, categoryId: 'internet' }),
      ],
      transactions: [
        // pagamento com multa/atraso num mês do histórico — não deve distorcer a sugestão
        tx({ categoryId: 'internet', amountCents: 25000, refMonth: 5, refYear: 2026 }),
      ],
    });
    const b = computeBudget(d, 5, 2026);
    expect(b.categories[0].fixed).toBe(true);
    expect(b.categories[0].suggestedCents).toBe(12000); // valor contratado, não a média com a multa
  });
});
