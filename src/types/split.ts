// "Dividir" — tipos do módulo de despesa em grupo. Deliberadamente fora de
// src/types/index.ts: não tem nenhuma relação com Wallet/Account/Category.

export interface SplitGroupSummary {
  id: string;
  name: string;
  archived: boolean;
  memberCount: number;
  /** meu saldo nesse grupo — positivo = me devem, negativo = eu devo. */
  netCents: number;
}

export interface SplitMember {
  id: string;
  groupId: string;
  userId: string | null;
  telegramUserId: number | null;
  displayName: string;
  leftAt: string | null;
}

export interface SplitExpense {
  id: string;
  groupId: string;
  description: string;
  amountCents: number;
  paidBy: string;
  date: string;
  createdBy: string | null;
  createdAt: string;
}

export interface SplitShare {
  id: string;
  expenseId: string;
  memberId: string;
  shareCents: number;
}

export interface SplitPayment {
  id: string;
  groupId: string;
  fromMember: string;
  toMember: string;
  amountCents: number;
  date: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface SplitGroupDetail {
  group: { id: string; name: string; archived: boolean; createdBy: string | null };
  members: SplitMember[];
  expenses: SplitExpense[];
  shares: SplitShare[];
  payments: SplitPayment[];
}
