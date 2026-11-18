import { describe, expect, it } from 'vitest';
import { mapPluggyTx } from '../bankImport.js';
import type { PluggyTransaction } from '../pluggy.js';

const checking = { kind: 'checking', closing_day: null };
const card = { kind: 'card', closing_day: 29 };

const tx = (p: Partial<PluggyTransaction>): PluggyTransaction => ({
  id: 'x', accountId: 'a', date: '2026-11-10T19:20:15.083Z', description: '', amount: 0,
  type: 'DEBIT', status: 'POSTED', ...p,
});

describe('mapPluggyTx', () => {
  it('conta: saída negativa vira despesa em centavos, data em São Paulo', () => {
    // 02:59:59Z = 23:59 do dia anterior em SP
    const m = mapPluggyTx(tx({ amount: -174.08, date: '2026-11-11T02:59:59.999Z', description: 'Débito automático DA CLARO' }), checking);
    expect(m).toMatchObject({ kind: 'expense', amount_cents: 17408, date: '2026-11-10', status: 'cleared', ref_month: 11, ref_year: 2026 });
    expect(m.invoiceRef).toBeNull();
  });

  it('conta: entrada positiva vira receita', () => {
    expect(mapPluggyTx(tx({ amount: 1500, type: 'CREDIT' }), checking).kind).toBe('income');
  });

  it('conta: pagamento de fatura é transferência de saída, não despesa', () => {
    const m = mapPluggyTx(tx({ amount: -1536.91, description: 'Pagamento de fatura Fatura Pag' }), checking);
    expect(m).toMatchObject({ kind: 'transfer', transfer_credit: false, amount_cents: 153691 });
  });

  it('cartão: compra parcelada usa o mês da fatura que o banco informa', () => {
    const m = mapPluggyTx(tx({
      amount: 650.2, status: 'PENDING', date: '2027-06-26T03:00:00.000Z', description: 'FS PLAZA SULSAO PA10/10',
      creditCardMetadata: { installmentNumber: 10, totalInstallments: 10, billForecastDate: '2027-07' },
    }), card);
    expect(m).toMatchObject({
      kind: 'expense', status: 'pending', date: '2027-06-26', installment_no: 10, installment_of: 10,
      ref_month: 7, ref_year: 2027, invoiceRef: { refMonth: 7, refYear: 2027 },
    });
  });

  it('cartão: sem previsão de fatura, cai pela data de fechamento', () => {
    const m = mapPluggyTx(tx({ amount: 50, date: '2026-11-30T15:00:00.000Z' }), card);
    expect(m.invoiceRef).toEqual({ refMonth: 12, refYear: 2026 });
  });

  it('cartão: pagamento recebido é transferência de entrada; estorno vira receita', () => {
    expect(mapPluggyTx(tx({ amount: -9714.78, type: 'CREDIT', description: 'PAGAMENTO EFETUADO' }), card))
      .toMatchObject({ kind: 'transfer', transfer_credit: true, invoiceRef: null });
    expect(mapPluggyTx(tx({ amount: -30, type: 'CREDIT', description: 'ESTORNO LOJA X' }), card).kind).toBe('income');
  });
});

describe('mapPluggyTx — situação no cartão', () => {
  it('compra já feita em fatura aberta (PENDING na Pluggy) conta como lançamento', () => {
    const m = mapPluggyTx(tx({ amount: 87.5, status: 'PENDING', date: '2026-11-10T15:00:00.000Z' }), card, '2026-11-18');
    expect(m.status).toBe('cleared');
  });
  it('parcela com data futura fica prevista', () => {
    const m = mapPluggyTx(tx({ amount: 650.2, status: 'PENDING', date: '2026-12-26T03:00:00.000Z' }), card, '2026-11-18');
    expect(m.status).toBe('pending');
  });
});
