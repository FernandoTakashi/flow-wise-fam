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
  dueDay: number; // Dia do mês para vencimento
  isPaid: boolean;
  paidBy?: string;
  paidAt?: Date;
  createdAt: Date;
  effectiveFrom: Date; // Data a partir da qual essa versão é válida
  effectiveUntil?: Date; // Data até quando essa versão é válida
  originalId?: string; // ID original para rastrear versões
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

export interface DashboardData {
  monthlyExpenses: number;
  currentBalance: number;
  projectedBalance: number;
  pendingFixedExpenses: number;
  pendingCreditCards: number;
  totalInvestments: number;
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