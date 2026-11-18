import { describe, expect, it } from 'vitest';
import { matchTextFrom, normalizeDesc } from '../bankReconcile.js';

describe('regra aprendida de fixo', () => {
  it('normaliza acento, número e pontuação', () => {
    expect(normalizeDesc('Débito automático DA CLARO S.A 11/2026')).toBe('DEBITO AUTOMATICO DA CLARO S A');
  });

  it('a regra do mês passado casa com a descrição deste mês', () => {
    const rule = matchTextFrom('Débito automático DA CLARO S.A')!;
    expect(rule).toBe('DEBITO AUTOMATICO DA CLARO');
    expect(normalizeDesc('Debito automatico DA CLARO S.A. ref 12').includes(rule)).toBe(true);
  });

  it('descrição curta demais não vira regra', () => {
    expect(matchTextFrom('PIX 12,00')).toBeNull();
  });
});
