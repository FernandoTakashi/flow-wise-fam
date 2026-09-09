// Cópia enxuta dos helpers puros de src/lib/dates.ts e src/lib/money.ts.
// Vendorizado aqui porque as Vercel Functions transpilam por arquivo (sem
// bundle) e importar de fora de api/ é frágil. Mantenha em sincronia com
// os originais se a lógica de datas/dinheiro mudar.

// ---- datas (ISO 'yyyy-mm-dd', sem Date no domínio) ----
export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isoParts = (iso: string): { y: number; m: number; d: number } => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: (m || 1) - 1, d: d || 1 };
};

/** Uma data qualquer → dia-calendário em America/Sao_Paulo. */
export const spDateISO = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

/** Dia `day` do mês (m 0-11), com clamp (ex.: dia 31 em fevereiro → 28/29). */
export const dayOfMonthISO = (year: number, month: number, day: number): string => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return toISO(new Date(year, month, Math.min(day, lastDay)));
};

/** Vencimento de uma recorrência no mês (m 0-11). `day <= 0` → último dia do mês. */
export const recurrenceDueISO = (year: number, month: number, day: number): string =>
  day <= 0 ? toISO(new Date(year, month + 1, 0)) : dayOfMonthISO(year, month, day);

/** A qual fatura uma compra pertence, dada a data e o dia de fechamento. refMonth 1-12. */
export const resolveInvoiceRef = (
  dateISO: string, closingDay: number,
): { refMonth: number; refYear: number } => {
  const { y, m, d } = isoParts(dateISO);
  let month = m;
  let year = y;
  if (d > closingDay) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return { refMonth: month + 1, refYear: year };
};

/** Datas de fechamento e vencimento de uma fatura (refMonth 1-12). */
export const invoiceDates = (
  refMonth: number, refYear: number, closingDay: number, dueDay: number,
): { closingDate: string; dueDate: string } => {
  const m = refMonth - 1;
  const closingDate = dayOfMonthISO(refYear, m, closingDay);
  const dueMonthOffset = dueDay > closingDay ? 0 : 1;
  const dueDate = dayOfMonthISO(refYear, m + dueMonthOffset, dueDay);
  return { closingDate, dueDate };
};

// ---- dinheiro (centavos inteiros) ----
export const toCents = (value: number | string): number => {
  if (typeof value === 'number') return Math.round(value * 100);
  const normalized = value
    .trim()
    .replace(/\s|R\$/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const formatBRL = (cents: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

/** Divide um total em `n` partes inteiras; a última absorve o resto. */
export const splitInstallments = (totalCents: number, n: number): number[] => {
  if (n <= 1) return [totalCents];
  const base = Math.floor(totalCents / n);
  const parts = new Array(n).fill(base);
  parts[n - 1] = totalCents - base * (n - 1);
  return parts;
};
