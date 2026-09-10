// Retrato imutável da carteira + tipos de leitura. Sem React, sem Supabase —
// entrada de todos os seletores puros de `src/core`.
import type {
  Account, CardInvoice, Category, Investment, PeriodLock, Recurrence,
  Transaction, WalletMember, WalletSettings, UUID, InvoiceStatus,
} from '@/types';

export type { UUID };

/** Tudo que os seletores precisam para calcular. */
export interface FinanceData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  recurrences: Recurrence[];
  invoices: CardInvoice[];
  investments: Investment[];
  members: WalletMember[];
  periodLocks: PeriodLock[];
  settings: WalletSettings | null;
  /** data-corrente (America/Sao_Paulo), yyyy-mm-dd */
  today: string;
}

export interface OccurrenceView {
  recurrence: Recurrence;
  dueDateISO: string;
  txId: UUID | null;
  status: 'none' | 'pending' | 'paid';
  amountCents: number;
  estimatedCents: number;
  onCard: boolean;
  /** empréstimo/parcelamento: nº desta parcela e total (null se recorrência sem fim) */
  installmentNo: number | null;
  installmentsTotal: number | null;
}

export interface InvoiceRow {
  key: string;
  description: string;
  dateISO: string;
  amountCents: number;
  type: 'variavel' | 'fixo' | 'previsto';
  projected: boolean;
}

export interface InvoiceView {
  invoice: CardInvoice | null;
  status: InvoiceStatus;
  postedCents: number;      // o que já está lançado na fatura
  projectedCents: number;   // posted + fixos de cartão ainda não lançados
  rows: InvoiceRow[];
}

export interface MemberSpend { memberId: UUID; totalCents: number }

export interface MonthSummary {
  incomeRealizedCents: number;
  expenseRealizedCents: number;
  pendingIncomeCents: number;
  pendingExpenseCents: number;
  cardBillCents: number;
  cardOpenCents: number;
  cashBalanceCents: number;
  projectedBalanceCents: number;
}
