// Datas como string ISO 'yyyy-mm-dd'. Sem Date no domínio → sem shift de fuso.

export const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const MONTHS_PT_SHORT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/** Hoje pelo relógio do dispositivo (fallback). Preferir `today` do FinanceContext. */
export const todayISO = (): string => toISO(new Date());

/** Uma data qualquer convertida para o dia-calendário em America/Sao_Paulo ('yyyy-mm-dd'). */
export const spDateISO = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** { y, m (0-11), d }. */
export const isoParts = (iso: string): { y: number; m: number; d: number } => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: (m || 1) - 1, d: d || 1 };
};

/** 'yyyy-mm-dd' → Date à meia-noite LOCAL (não UTC). */
export const parseISO = (iso: string): Date => {
  const { y, m, d } = isoParts(iso);
  return new Date(y, m, d);
};

export const formatDayMonth = (iso: string): string =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(parseISO(iso));

export const formatFullDate = (iso: string): string =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseISO(iso));

/** Soma meses preservando o dia (com clamp para meses curtos). */
export const addMonthsISO = (iso: string, months: number): string => {
  const { y, m, d } = isoParts(iso);
  const target = new Date(y, m + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISO(new Date(target.getFullYear(), target.getMonth(), Math.min(d, lastDay)));
};

/** Dia `day` do mês (m 0-11), com clamp (ex.: dia 31 em fevereiro → 28/29). */
export const dayOfMonthISO = (year: number, month: number, day: number): string => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return toISO(new Date(year, month, Math.min(day, lastDay)));
};

export const isInMonth = (iso: string, month: number, year: number): boolean => {
  const { y, m } = isoParts(iso);
  return m === month && y === year;
};

export const isOnOrBefore = (iso: string, refISO: string): boolean => iso <= refISO;

/**
 * A qual fatura uma compra pertence, dada a data e o dia de fechamento do cartão.
 * Compras até (inclusive) o dia de fechamento entram na fatura do mês corrente;
 * a partir do dia seguinte, entram na próxima fatura.
 * Retorna refMonth 1-12.
 */
export const resolveInvoiceRef = (
  dateISO: string,
  closingDay: number,
): { refMonth: number; refYear: number } => {
  const { y, m, d } = isoParts(dateISO);
  let month = m; // 0-11
  let year = y;
  if (d > closingDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return { refMonth: month + 1, refYear: year };
};

/** Datas de fechamento e vencimento de uma fatura (refMonth 1-12). */
export const invoiceDates = (
  refMonth: number,
  refYear: number,
  closingDay: number,
  dueDay: number,
): { closingDate: string; dueDate: string } => {
  const m = refMonth - 1; // 0-11
  const closingDate = dayOfMonthISO(refYear, m, closingDay);
  // vencimento normalmente cai depois do fechamento; se dueDay <= closingDay,
  // assume-se vencimento no mês seguinte.
  const dueMonthOffset = dueDay > closingDay ? 0 : 1;
  const dueDate = dayOfMonthISO(refYear, m + dueMonthOffset, dueDay);
  return { closingDate, dueDate };
};
