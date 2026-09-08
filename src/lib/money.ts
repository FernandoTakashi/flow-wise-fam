// Dinheiro em centavos inteiros. Nunca fazer aritmética financeira em reais.

/** Reais (número ou string "1.234,56" / "1234.56") → centavos inteiros. */
export const toCents = (value: number | string): number => {
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  const normalized = value
    .trim()
    .replace(/\s|R\$/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // separador de milhar
    .replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Centavos → reais (para inputs numéricos). */
export const fromCents = (cents: number): number => (cents || 0) / 100;

/** Centavos → "R$ 1.234,56". */
export const formatBRL = (cents: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

/** Centavos → "1.234,56" (sem símbolo), para campos editáveis. */
export const centsToInput = (cents: number): string =>
  cents === 0 ? '' : (cents / 100).toFixed(2);

/**
 * Divide um total em `n` parcelas inteiras; a última absorve o resto,
 * garantindo que a soma bate exatamente com o total.
 */
export const splitInstallments = (totalCents: number, n: number): number[] => {
  if (n <= 1) return [totalCents];
  const base = Math.floor(totalCents / n);
  const parts = new Array(n).fill(base);
  parts[n - 1] = totalCents - base * (n - 1);
  return parts;
};

/** pontos-base → percentual (50 → 0.5). */
export const bpsToPct = (bps: number): number => (bps || 0) / 100;

/** percentual (número ou string "0,5") → pontos-base (0.5 → 50). */
export const pctToBps = (pct: number | string): number => {
  const n = typeof pct === 'string' ? parseFloat(pct.replace(',', '.')) : pct;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** "0,50%" a partir de pontos-base. */
export const formatPct = (bps: number, digits = 2): string =>
  `${bpsToPct(bps).toFixed(digits).replace('.', ',')}%`;
