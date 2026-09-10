import type { FinanceData } from './types';

export function totalInvestedCents(d: FinanceData): number {
  return (d.settings?.initialInvestmentCents ?? 0) + d.investments.reduce((s, i) => s + i.amountCents, 0);
}

export function investmentMonthlyYieldCents(d: FinanceData): number {
  return d.investments.reduce((s, i) => s + Math.round(i.amountCents * (i.yieldRateBps / 10000)), 0);
}
