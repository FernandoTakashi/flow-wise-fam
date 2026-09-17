import { describe, it, expect } from 'vitest';
import {
  computeSplitBalances, simplifySplitDebts, equalSplitShares, exactSharesMatchTotal,
} from '@/core/split';

describe('computeSplitBalances', () => {
  it('quem paga fica credor; quem tem parte fica devedor', () => {
    // A paga 100, dividido igual entre A e B (50 cada)
    const bal = computeSplitBalances(
      ['A', 'B'],
      [{ id: 'e1', paidBy: 'A', amountCents: 10000 }],
      [{ expenseId: 'e1', memberId: 'A', shareCents: 5000 }, { expenseId: 'e1', memberId: 'B', shareCents: 5000 }],
      [],
    );
    expect(bal.find((b) => b.memberId === 'A')?.netCents).toBe(5000);
    expect(bal.find((b) => b.memberId === 'B')?.netCents).toBe(-5000);
  });

  it('membro sem nenhuma despesa/parte fica em zero', () => {
    const bal = computeSplitBalances(['A', 'B', 'C'], [], [], []);
    expect(bal.every((b) => b.netCents === 0)).toBe(true);
  });

  it('acerto quita a dívida', () => {
    const bal = computeSplitBalances(
      ['A', 'B'],
      [{ id: 'e1', paidBy: 'A', amountCents: 10000 }],
      [{ expenseId: 'e1', memberId: 'A', shareCents: 5000 }, { expenseId: 'e1', memberId: 'B', shareCents: 5000 }],
      [{ fromMember: 'B', toMember: 'A', amountCents: 5000 }],
    );
    expect(bal.find((b) => b.memberId === 'A')?.netCents).toBe(0);
    expect(bal.find((b) => b.memberId === 'B')?.netCents).toBe(0);
  });

  it('despesa que exclui participantes não mexe no saldo de quem ficou de fora', () => {
    const bal = computeSplitBalances(
      ['A', 'B', 'C'],
      [{ id: 'e1', paidBy: 'A', amountCents: 6000 }],
      [{ expenseId: 'e1', memberId: 'A', shareCents: 3000 }, { expenseId: 'e1', memberId: 'B', shareCents: 3000 }],
      [],
    );
    expect(bal.find((b) => b.memberId === 'C')?.netCents).toBe(0);
  });
});

describe('simplifySplitDebts', () => {
  it('dois membros: uma transferência só', () => {
    const s = simplifySplitDebts([{ memberId: 'A', netCents: 5000 }, { memberId: 'B', netCents: -5000 }]);
    expect(s).toEqual([{ fromMemberId: 'B', toMemberId: 'A', amountCents: 5000 }]);
  });

  it('saldo zerado não gera transferência nenhuma', () => {
    expect(simplifySplitDebts([{ memberId: 'A', netCents: 0 }, { memberId: 'B', netCents: 0 }])).toEqual([]);
  });

  it('três membros: simplifica pro mínimo de transferências', () => {
    // A pagou 90 dividido entre A/B/C (30 cada) → A:+60, B:-30, C:-30
    const s = simplifySplitDebts([
      { memberId: 'A', netCents: 6000 },
      { memberId: 'B', netCents: -3000 },
      { memberId: 'C', netCents: -3000 },
    ]);
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.toMemberId === 'A')).toBe(true);
    expect(s.reduce((sum, x) => sum + x.amountCents, 0)).toBe(6000);
  });
});

describe('equalSplitShares', () => {
  it('divide exato quando divisível', () => {
    expect(equalSplitShares(9000, ['A', 'B', 'C'])).toEqual({ A: 3000, B: 3000, C: 3000 });
  });

  it('resto de centavos é distribuído 1 a 1 pelos primeiros — soma sempre bate com o total', () => {
    const shares = equalSplitShares(10000, ['A', 'B', 'C']);
    expect(Object.values(shares).reduce((s, c) => s + c, 0)).toBe(10000);
    expect(shares.A).toBe(3334);
    expect(shares.B).toBe(3333);
    expect(shares.C).toBe(3333);
  });

  it('900 reais em 11 pessoas — ninguém fica com um valor destoante', () => {
    const shares = equalSplitShares(90000, Array.from({ length: 11 }, (_, i) => `m${i}`));
    expect(Object.values(shares).reduce((s, c) => s + c, 0)).toBe(90000);
    const values = Object.values(shares);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it('lista vazia devolve objeto vazio', () => {
    expect(equalSplitShares(1000, [])).toEqual({});
  });
});

describe('exactSharesMatchTotal', () => {
  it('bate', () => {
    expect(exactSharesMatchTotal(10000, { A: 4000, B: 6000 })).toBe(true);
  });
  it('não bate', () => {
    expect(exactSharesMatchTotal(10000, { A: 4000, B: 5000 })).toBe(false);
  });
});
