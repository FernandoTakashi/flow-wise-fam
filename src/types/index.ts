export interface User {
  id: string;
  name: string;
  email?: string;
  createdAt: Date;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: Date;
  type: 'variavel' | 'cartao_credito';
  category: string;
  paymentMethod?: string;
  
  // --- ADICIONE ESTA LINHA ---
  userId: string; 
  // ---------------------------

  installments?: {
    current: number;
    total: number;
  };
  createdAt?: Date; // Garanta que este também esteja aqui se usar
}

// ... mantenha as outras interfaces (User, Expense, etc) ...

// ADICIONE ISTO:
export interface FixedIncome {
  id: string;
  description: string;
  amount: number;
  receiveDay: number; // Dia de receber
  isReceived: boolean;
  receivedBy?: string;
  receivedAt?: Date;
  createdAt: Date;
  effectiveFrom: Date;
  effectiveUntil?: Date;
}

// ... mantenha o resto ...

export interface FixedExpense {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  dueDay: number;
  isPaid: boolean;
  paidBy?: string;
  paidAt?: Date;
  createdAt: Date;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  paidAmount?: number;
  creditCardId?: string | null; 
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
  monthlyYield: number; // Percentual mensal de rendimento sobre investimentos
  initialBalance: number;
  initialInvestment: number; // Valor inicial investido
}

export interface Investment {
  id: string;
  description: string;
  amount: number;
  yieldRate?: number; 
  date: Date;
  userId: string;
  createdAt: Date;
}

export interface MonthlyFilter {
  month: number; // 0-11 (Janeiro = 0)
  year: number;
}

export type ExpenseCategory = 
  | 'alimentacao'
  | 'transporte'
  | 'lazer'
  | 'saude'
  | 'educacao'
  | 'moradia'
  | 'vestuario'
  | 'presente'
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

// Em src/types/index.ts

export interface CreditCardWithBill extends CreditCard {
  billAmount: number;
}

// Atualize a interface DashboardData
export interface DashboardData {
  // ... (outros campos mantêm igual)
  totalIncome: number;
  totalFixedExpenses: number;
  variableExpenses: number;
  totalInvestments: number;
  projectedBalance: number;
  currentBalance: number;
  pendingFixedExpenses: number;
  pendingFixedList: FixedExpense[];
  pendingIncomeValue: number;         // Valor R$ que falta receber (Entradas Fixas)
  pendingFixedExpensesValue: number;
  
  pendingCreditCards: number;
  // MUDE AQUI 👇: De CreditCard[] para CreditCardWithBill[]
  pendingCreditCardList: CreditCardWithBill[]; 

  investmentYield: number;
  topUsers: Array<{
    userId: string;
    userName: string;
    totalAmount: number;
    type: 'income' | 'outcome';
  }>;
}

export interface MonthlyData {
  month: number;
  year: number;
  fixedExpenses: FixedExpense[];
  variableExpenses: Expense[];
  creditCardExpenses: Expense[];
  cashMovements: CashMovement[];
  investments: Investment[];
}

export interface FixedPayment {
  id: string;
  fixedExpenseId: string;
  month: number;
  year: number;
  amount: number;
  paidAt: Date;
  generatedExpenseId?: string; 
}

export interface FixedReceipt {
  id: string;
  fixedIncomeId: string;
  month: number;
  year: number;
  amount: number;
  receivedAt: Date;
}