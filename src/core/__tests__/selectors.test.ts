import { describe, it, expect } from 'vitest';
import type { Account, CardInvoice, Recurrence, Transaction, WalletMember } from '@/types';
import type { FinanceData } from '@/core';
import {
  accountBalance, cardCommitted, cardAvailableCents, computeInvoiceView, recurrenceOccurrences,
  monthSummary, spendByMember, jointSpendCents, settlements, memberBalances,
  wouldOverdraw, wouldExceedLimit, isPeriodLocked,
} from '@/core';

// --- factories -------------------------------------------------------------
const acc = (o: Partial<Account>): Account => ({
  id: 'a', walletId: 'w', name: 'Conta', kind: 'checking', openingBalanceCents: 0,
  closingDay: null, dueDay: null, creditLimitCents: null, archived: false, ...o,
});
const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2), walletId: 'w', accountId: 'a', kind: 'expense',
  amountCents: 0, date: '2026-06-15', refMonth: 6, refYear: 2026, status: 'cleared', description: '',
  categoryId: null, memberId: null, cardInvoiceId: null, recurrenceId: null, occMonth: null, occYear: null,
  installmentGroup: null, installmentNo: null, installmentOf: null, transferPeerId: null, note: null,
  shared: false, createdBy: null, source: 'app', splits: [], ...o,
});
const rec = (o: Partial<Recurrence>): Recurrence => ({
  id: 'r', walletId: 'w', description: 'Aluguel', kind: 'expense', amountCents: 100000,
  categoryId: null, accountId: null, day: 10, frequency: 'monthly', startDate: '2026-01-01', endDate: null,
  active: true, autopay: false, variableAmount: false, shared: false,
  installmentsTotal: null, installmentsDone: 0, ...o,
});
const inv = (o: Partial<CardInvoice>): CardInvoice => ({
  id: 'i', walletId: 'w', accountId: 'card', refMonth: 6, refYear: 2026,
  closingDate: '2026-06-05', dueDate: '2026-06-12', status: 'open', paidTransactionId: null, ...o,
});
const member = (id: string): WalletMember => ({ walletId: 'w', userId: id, role: 'member' });

const base = (o: Partial<FinanceData> = {}): FinanceData => ({
  transactions: [], accounts: [], categories: [], recurrences: [], invoices: [],
  investments: [], members: [], periodLocks: [], settings: null, today: '2026-06-20', ...o,
});

// --- accountBalance ------------------------------------------------------
describe('accountBalance', () => {
  const checking = acc({ id: 'c', kind: 'checking', openingBalanceCents: 50000 });

  it('opening + entradas − saídas cleared', () => {
    const txs = [
      tx({ accountId: 'c', kind: 'income', amountCents: 30000 }),
      tx({ accountId: 'c', kind: 'expense', amountCents: 12000 }),
    ];
    expect(accountBalance(checking, txs, '2026-06-30')).toBe(50000 + 30000 - 12000);
  });

  it('ignora pending e datas depois do corte', () => {
    const txs = [
      tx({ accountId: 'c', kind: 'expense', amountCents: 9999, status: 'pending' }),
      tx({ accountId: 'c', kind: 'expense', amountCents: 7000, date: '2026-07-01' }),
      tx({ accountId: 'c', kind: 'expense', amountCents: 1000, date: '2026-06-10' }),
    ];
    expect(accountBalance(checking, txs, '2026-06-20')).toBe(50000 - 1000);
  });

  it('excludeId tira aquela transação da conta', () => {
    const t = tx({ id: 'X', accountId: 'c', kind: 'expense', amountCents: 4000 });
    expect(accountBalance(checking, [t], '2026-06-30', 'X')).toBe(50000);
  });

  it('transferência: saída em conta de dinheiro, entrada em cartão', () => {
    const card = acc({ id: 'k', kind: 'card' });
    const t = tx({ kind: 'transfer', amountCents: 8000 });
    expect(accountBalance(checking, [{ ...t, accountId: 'c' }], '2026-06-30')).toBe(50000 - 8000);
    expect(accountBalance(card, [{ ...t, accountId: 'k' }], '2026-06-30')).toBe(0 + 8000);
  });
});

// --- cardCommitted / cardAvailable ------------------------------------
describe('cardCommitted', () => {
  it('soma só despesas em faturas não pagas', () => {
    const invoices = [inv({ id: 'open', status: 'open' }), inv({ id: 'paid', status: 'paid' })];
    const txs = [
      tx({ accountId: 'card', cardInvoiceId: 'open', amountCents: 20000 }),
      tx({ accountId: 'card', cardInvoiceId: 'paid', amountCents: 99999 }),
      tx({ accountId: 'card', cardInvoiceId: 'open', kind: 'transfer', amountCents: 12345 }),
    ];
    expect(cardCommitted('card', txs, invoices)).toBe(20000);
  });

  it('cardAvailableCents = limite − comprometido', () => {
    const d = base({
      accounts: [acc({ id: 'card', kind: 'card', creditLimitCents: 100000 })],
      invoices: [inv({ id: 'open', status: 'open' })],
      transactions: [tx({ accountId: 'card', cardInvoiceId: 'open', amountCents: 30000 })],
    });
    expect(cardAvailableCents(d, 'card')).toBe(70000);
  });
});

// --- guards ----------------------------------------------------------
describe('guards', () => {
  const d = base({
    accounts: [
      acc({ id: 'c', kind: 'checking', openingBalanceCents: 10000 }),
      acc({ id: 'card', kind: 'card', creditLimitCents: 50000 }),
    ],
    invoices: [inv({ id: 'open', accountId: 'card', status: 'open' })],
    transactions: [tx({ accountId: 'card', cardInvoiceId: 'open', amountCents: 45000 })],
    periodLocks: [{ walletId: 'w', refMonth: 5, refYear: 2026, lockedBy: null, lockedAt: '' }],
  });

  it('wouldOverdraw', () => {
    expect(wouldOverdraw(d, 'c', 9000)).toBe(false);
    expect(wouldOverdraw(d, 'c', 11000)).toBe(true);
    expect(wouldOverdraw(d, 'card', 999999)).toBe(false); // cartão nunca "overdraw"
  });

  it('wouldExceedLimit', () => {
    expect(wouldExceedLimit(d, 'card', 5000)).toBe(false);   // 45k + 5k = 50k, no limite
    expect(wouldExceedLimit(d, 'card', 6000)).toBe(true);    // passa de 50k
  });

  it('isPeriodLocked por mês 0-index', () => {
    expect(isPeriodLocked(d.periodLocks, 4, 2026)).toBe(true);  // maio
    expect(isPeriodLocked(d.periodLocks, 5, 2026)).toBe(false); // junho
  });
});

// --- recurrenceOccurrences ----------------------------------------
describe('recurrenceOccurrences', () => {
  it('status pela âncora occ_month/occ_year', () => {
    const d = base({
      recurrences: [rec({ id: 'r1', day: 10 })],
      transactions: [tx({ recurrenceId: 'r1', occMonth: 6, occYear: 2026, status: 'cleared', amountCents: 98000 })],
    });
    const [o] = recurrenceOccurrences(d, 5, 2026); // junho
    expect(o.status).toBe('paid');
    expect(o.amountCents).toBe(98000);
    expect(o.estimatedCents).toBe(100000);
    // tx de outro mês não conta como baixa de junho
    const d2 = base({
      recurrences: [rec({ id: 'r1' })],
      transactions: [tx({ recurrenceId: 'r1', occMonth: 5, occYear: 2026, status: 'cleared' })],
    });
    expect(recurrenceOccurrences(d2, 5, 2026)[0].status).toBe('none');
  });

  it('empréstimo: só gera ocorrência dentro das parcelas', () => {
    const d = base({ recurrences: [rec({ id: 'loan', startDate: '2026-05-01', installmentsTotal: 3, installmentsDone: 0 })] });
    expect(recurrenceOccurrences(d, 4, 2026)).toHaveLength(1); // maio = parcela 1
    expect(recurrenceOccurrences(d, 6, 2026)).toHaveLength(1); // julho = parcela 3
    expect(recurrenceOccurrences(d, 7, 2026)).toHaveLength(0); // agosto = parcela 4 > 3
  });
});

// --- computeInvoiceView -----------------------------------------
describe('computeInvoiceView', () => {
  it('postedCents = Σ despesas da fatura; previstos entram no projected', () => {
    const d = base({
      accounts: [acc({ id: 'card', kind: 'card', closingDay: 5 })],
      invoices: [inv({ id: 'i6', accountId: 'card', refMonth: 6, refYear: 2026, status: 'open' })],
      transactions: [
        tx({ accountId: 'card', cardInvoiceId: 'i6', kind: 'expense', amountCents: 15000 }),
        tx({ accountId: 'card', cardInvoiceId: 'i6', kind: 'expense', amountCents: 5000 }),
      ],
      recurrences: [rec({ id: 'rc', accountId: 'card', kind: 'expense', day: 20, amountCents: 8000, startDate: '2026-01-01' })],
    });
    const v = computeInvoiceView(d, 'card', 5, 2026); // junho
    expect(v.postedCents).toBe(20000);
    expect(v.projectedCents).toBe(28000);
    expect(v.status).toBe('open');
    expect(v.rows.filter((r) => r.projected)).toHaveLength(1);
  });

  it('sem fatura → status open, zero', () => {
    const v = computeInvoiceView(base({ accounts: [acc({ id: 'card', kind: 'card' })] }), 'card', 5, 2026);
    expect(v.invoice).toBeNull();
    expect(v.postedCents).toBe(0);
  });
});

// --- spendByMember / jointSpendCents ------------------------------
describe('spend por membro', () => {
  const d = base({
    members: [member('u1'), member('u2')],
    transactions: [
      tx({ kind: 'expense', status: 'cleared', memberId: 'u1', amountCents: 30000, refMonth: 6, refYear: 2026 }),
      tx({ kind: 'expense', status: 'cleared', memberId: 'u2', amountCents: 10000, refMonth: 6, refYear: 2026 }),
      tx({ kind: 'expense', status: 'cleared', memberId: 'u1', amountCents: 50000, shared: true, refMonth: 6, refYear: 2026 }),
      tx({ kind: 'expense', status: 'cleared', memberId: 'u1', amountCents: 999, refMonth: 5, refYear: 2026 }),
    ],
  });

  it('individual ignora shared e outros meses; ordenado desc', () => {
    const r = spendByMember(d, 5, 2026);
    expect(r).toEqual([{ memberId: 'u1', totalCents: 30000 }, { memberId: 'u2', totalCents: 10000 }]);
  });

  it('jointSpendCents soma só os shared do mês', () => {
    expect(jointSpendCents(d, 5, 2026)).toBe(50000);
    expect(jointSpendCents(d, 4, 2026)).toBe(0);
  });
});

// --- memberBalances / settlements ------------------------------
describe('settlements', () => {
  it('divide via splits e casa devedor/credor', () => {
    const d = base({
      members: [member('u1'), member('u2')],
      transactions: [tx({
        kind: 'expense', status: 'cleared', memberId: 'u1', amountCents: 10000,
        splits: [
          { id: 's1', transactionId: 't', memberId: 'u1', shareCents: 5000 },
          { id: 's2', transactionId: 't', memberId: 'u2', shareCents: 5000 },
        ],
      })],
    });
    const bal = memberBalances(d);
    expect(bal.find((b) => b.memberId === 'u1')!.netCents).toBe(5000);
    expect(bal.find((b) => b.memberId === 'u2')!.netCents).toBe(-5000);
    expect(settlements(d)).toEqual([{ fromId: 'u2', toId: 'u1', amountCents: 5000 }]);
  });
});

// --- monthSummary --------------------------------------------
describe('monthSummary', () => {
  it('separa realizado (competência) de pendente e fecha a projeção', () => {
    const d = base({
      today: '2026-06-20',
      accounts: [acc({ id: 'c', kind: 'checking', openingBalanceCents: 100000 })],
      transactions: [
        tx({ accountId: 'c', kind: 'income', status: 'cleared', amountCents: 40000, refMonth: 6, refYear: 2026, date: '2026-06-05' }),
        tx({ accountId: 'c', kind: 'expense', status: 'cleared', amountCents: 15000, refMonth: 6, refYear: 2026, date: '2026-06-08' }),
        tx({ accountId: 'c', kind: 'expense', status: 'pending', amountCents: 7000, refMonth: 6, refYear: 2026 }),
      ],
      recurrences: [rec({ id: 'rx', kind: 'expense', accountId: 'c', day: 25, amountCents: 12000, startDate: '2026-01-01' })],
    });
    const s = monthSummary(d, 5, 2026); // junho
    expect(s.incomeRealizedCents).toBe(40000);
    expect(s.expenseRealizedCents).toBe(15000);
    // pendências: boleto pendente 7000 + fixo não pago 12000
    expect(s.pendingExpenseCents).toBe(19000);
    // caixa hoje = 100k + 40k - 15k (o pending não entra no saldo) = 125k
    expect(s.cashBalanceCents).toBe(125000);
    expect(s.projectedBalanceCents).toBe(125000 + 0 - 19000);
  });
});
