export interface User {
  id: string;
  name: string;
  email?: string;
  createdAt: Date;
}

export interface Expense {
  id: string;
  date: Date;
  category: ExpenseCategory;
  type: ExpenseType;
  paymentMethod: PaymentMethod;
  description: string;
  amount: number;
  userId: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface FixedExpense {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  dueDay: number; // Dia do mês para vencimento
  isPaid: boolean;
  paidBy?: string;
  paidAt?: Date;
  createdAt: Date;
}

export interface CreditCard {
  id: string;
  name: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  isPaid: boolean;
  paidBy?: string;
  paidAt?: Date;
  createdAt: Date;
}

export interface CashMovement {
  id: string;
  type: 'income' | 'outcome';
  description: string;
  amount: number;
  userId: string;
  date: Date;
  createdAt: Date;
}

export interface FinancialSettings {
  monthlyYield: number; // Percentual mensal de rendimento
  initialBalance: number;
}

export type ExpenseCategory = 
  | 'alimentacao'
  | 'transporte'
  | 'lazer'
  | 'saude'
  | 'educacao'
  | 'moradia'
  | 'vestuario'
  | 'outros';

export type ExpenseType = 
  | 'fixo'
  | 'variavel'
  | 'cartao_credito';

export type PaymentMethod = 
  | 'dinheiro'
  | 'debito'
  | 'pix'
  | string; // Para cartões específicos (ex: "Nubank", "Itaú")

export interface DashboardData {
  monthlyExpenses: number;
  currentBalance: number;
  projectedBalance: number;
  pendingFixedExpenses: number;
  pendingCreditCards: number;
  topUsers: Array<{
    userId: string;
    userName: string;
    totalAmount: number;
    type: 'income' | 'outcome';
  }>;
}