// Domínio do FinanceApp — modelo unificado (transactions).
// Convenções:
//  - Dinheiro sempre em centavos inteiros (`*Cents`). Formatação só na UI.
//  - Datas sempre string ISO 'yyyy-mm-dd' (sem Date no domínio → sem bug de fuso).

export type UUID = string;

export type AccountKind = 'cash' | 'checking' | 'card';
export type TxKind = 'income' | 'expense' | 'transfer';
export type TxStatus = 'pending' | 'cleared';
export type CategoryKind = 'income' | 'expense';
export type MemberRole = 'owner' | 'member';
export type InvoiceStatus = 'open' | 'closed' | 'paid';
export type TxSource = 'app' | 'telegram' | 'whatsapp' | 'import' | 'auto';

export interface Profile {
  id: UUID;
  name: string;
  email?: string | null;
}

export interface Wallet {
  id: UUID;
  name: string;
  baseCurrency: string;
  createdBy?: UUID | null;
}

export interface WalletMember {
  walletId: UUID;
  userId: UUID;
  role: MemberRole;
  profile?: Profile;
}

export interface Account {
  id: UUID;
  walletId: UUID;
  name: string;
  kind: AccountKind;
  openingBalanceCents: number;
  /** só para kind === 'card' */
  closingDay?: number | null;
  dueDay?: number | null;
  creditLimitCents?: number | null;
  archived: boolean;
}

export interface Category {
  id: UUID;
  walletId: UUID;
  name: string;
  kind: CategoryKind;
  icon?: string | null;
  color?: string | null;
  archived: boolean;
}

export interface Recurrence {
  id: UUID;
  walletId: UUID;
  description: string;
  kind: CategoryKind;
  amountCents: number;
  categoryId?: UUID | null;
  accountId?: UUID | null;
  day: number;
  frequency: 'monthly';
  startDate: string;
  endDate?: string | null;
  active: boolean;
  /** débito automático: o lançamento é criado sozinho na data de vencimento */
  autopay: boolean;
}

export interface CardInvoice {
  id: UUID;
  walletId: UUID;
  accountId: UUID;
  refMonth: number; // 1-12
  refYear: number;
  closingDate: string;
  dueDate: string;
  status: InvoiceStatus;
  paidTransactionId?: UUID | null;
}

export interface TransactionSplit {
  id: UUID;
  transactionId: UUID;
  memberId: UUID;
  shareCents: number;
}

export interface Transaction {
  id: UUID;
  walletId: UUID;
  accountId: UUID;
  kind: TxKind;
  amountCents: number;
  /** data-caixa: quando o dinheiro se move (bate com o banco) */
  date: string;
  /** competência: a que mês o lançamento pertence (1-12). Cartão = mês da fatura. */
  refMonth: number;
  refYear: number;
  status: TxStatus;
  description: string;
  categoryId?: UUID | null;
  /** quem pagou / recebeu */
  memberId?: UUID | null;
  cardInvoiceId?: UUID | null;
  recurrenceId?: UUID | null;
  installmentGroup?: UUID | null;
  installmentNo?: number | null;
  installmentOf?: number | null;
  transferPeerId?: UUID | null;
  note?: string | null;
  createdBy?: UUID | null;
  /** origem do lançamento: app, bot (telegram/whatsapp), importação, débito automático */
  source: TxSource;
  splits: TransactionSplit[];
}

export interface Investment {
  id: UUID;
  walletId: UUID;
  memberId?: UUID | null;
  description: string;
  amountCents: number;
  /** pontos-base ao mês: 50 = 0,50% a.m. */
  yieldRateBps: number;
  date: string;
}

export interface WalletSettings {
  walletId: UUID;
  initialInvestmentCents: number;
  defaultYieldBps: number;
}

export interface PeriodLock {
  walletId: UUID;
  refMonth: number; // 1-12
  refYear: number;
  lockedBy?: UUID | null;
  lockedAt: string;
}

export interface MonthlyFilter {
  month: number; // 0-11
  year: number;
}

/** Saldo líquido de um membro na divisão de despesas (positivo = tem a receber). */
export interface MemberBalance {
  memberId: UUID;
  netCents: number;
}

/** Sugestão de acerto: `fromId` paga `amountCents` a `toId`. */
export interface Settlement {
  fromId: UUID;
  toId: UUID;
  amountCents: number;
}
