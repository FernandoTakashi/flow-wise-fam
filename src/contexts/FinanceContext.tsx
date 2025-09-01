import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { 
  User, 
  Expense, 
  FixedExpense, 
  CreditCard, 
  CashMovement, 
  FinancialSettings,
  DashboardData,
  Investment,
  MonthlyFilter,
  MonthlyData
} from '@/types';

interface FinanceState {
  users: User[];
  expenses: Expense[];
  fixedExpenses: FixedExpense[];
  creditCards: CreditCard[];
  cashMovements: CashMovement[];
  investments: Investment[];
  settings: FinancialSettings;
  selectedMonth: MonthlyFilter;
}

type FinanceAction = 
  | { type: 'ADD_USER'; payload: User }
  | { type: 'ADD_EXPENSE'; payload: Expense }
  | { type: 'ADD_FIXED_EXPENSE'; payload: FixedExpense }
  | { type: 'UPDATE_FIXED_EXPENSE'; payload: { id: string; updates: Partial<FixedExpense> } }
  | { type: 'ADD_CREDIT_CARD'; payload: CreditCard }
  | { type: 'UPDATE_CREDIT_CARD'; payload: { id: string; updates: Partial<CreditCard> } }
  | { type: 'ADD_CASH_MOVEMENT'; payload: CashMovement }
  | { type: 'ADD_INVESTMENT'; payload: Investment }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<FinancialSettings> }
  | { type: 'SET_SELECTED_MONTH'; payload: MonthlyFilter }
  | { type: 'LOAD_DATA'; payload: FinanceState };

const initialState: FinanceState = {
  users: [
    { id: '1', name: 'Fernando', createdAt: new Date() },
    { id: '2', name: 'Maria', createdAt: new Date() },
    { id: '3', name: 'João', createdAt: new Date() }
  ],
  expenses: [],
  fixedExpenses: [
    { 
      id: '1', 
      name: 'Aluguel', 
      category: 'moradia', 
      amount: 1200, 
      dueDay: 10, 
      isPaid: false,
      createdAt: new Date(),
      effectiveFrom: new Date(),
    },
    { 
      id: '2', 
      name: 'Internet', 
      category: 'moradia', 
      amount: 89.90, 
      dueDay: 15, 
      isPaid: true,
      paidBy: '1',
      paidAt: new Date(),
      createdAt: new Date(),
      effectiveFrom: new Date(),
    }
  ],
  creditCards: [
    { 
      id: '1', 
      name: 'Nubank', 
      limit: 5000, 
      closingDay: 15, 
      dueDay: 10, 
      isPaid: false,
      createdAt: new Date() 
    },
    { 
      id: '2', 
      name: 'Itaú', 
      limit: 3000, 
      closingDay: 20, 
      dueDay: 15, 
      isPaid: true,
      paidBy: '2',
      paidAt: new Date(),
      createdAt: new Date() 
    }
  ],
  cashMovements: [
    {
      id: '1',
      type: 'income',
      description: 'Salário Fernando',
      amount: 5000,
      userId: '1',
      date: new Date(2024, 11, 1),
      createdAt: new Date()
    },
    {
      id: '2',
      type: 'outcome',
      description: 'Saque',
      amount: 300,
      userId: '1',
      date: new Date(),
      createdAt: new Date()
    }
  ],
  investments: [],
  settings: {
    monthlyYield: 0.5, // 0.5% ao mês sobre investimentos
    initialBalance: 10000,
    initialInvestment: 0
  },
  selectedMonth: {
    month: new Date().getMonth(),
    year: new Date().getFullYear()
  }
};

const financeReducer = (state: FinanceState, action: FinanceAction): FinanceState => {
  switch (action.type) {
    case 'ADD_USER':
      return { ...state, users: [...state.users, action.payload] };
    case 'ADD_EXPENSE':
      return { ...state, expenses: [...state.expenses, action.payload] };
    case 'ADD_FIXED_EXPENSE':
      return { ...state, fixedExpenses: [...state.fixedExpenses, action.payload] };
    case 'UPDATE_FIXED_EXPENSE':
      return {
        ...state,
        fixedExpenses: state.fixedExpenses.map(expense =>
          expense.id === action.payload.id
            ? { ...expense, ...action.payload.updates }
            : expense
        )
      };
    case 'ADD_CREDIT_CARD':
      return { ...state, creditCards: [...state.creditCards, action.payload] };
    case 'UPDATE_CREDIT_CARD':
      return {
        ...state,
        creditCards: state.creditCards.map(card =>
          card.id === action.payload.id
            ? { ...card, ...action.payload.updates }
            : card
        )
      };
    case 'ADD_CASH_MOVEMENT':
      return { ...state, cashMovements: [...state.cashMovements, action.payload] };
    case 'ADD_INVESTMENT':
      return { ...state, investments: [...state.investments, action.payload] };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_SELECTED_MONTH':
      return { ...state, selectedMonth: action.payload };
    case 'LOAD_DATA':
      return action.payload;
    default:
      return state;
  }
};

interface FinanceContextType {
  state: FinanceState;
  dispatch: React.Dispatch<FinanceAction>;
  getDashboardData: () => DashboardData;
  getCurrentBalance: () => number;
  getTotalInvestments: () => number;
  getInvestmentYield: () => number;
  getMonthlyData: (month: number, year: number) => MonthlyData;
  getActiveFixedExpenses: (month: number, year: number) => FixedExpense[];
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance deve ser usado dentro de um FinanceProvider');
  }
  return context;
};

interface FinanceProviderProps {
  children: ReactNode;
}

export const FinanceProvider: React.FC<FinanceProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(financeReducer, initialState);

  // Persistir no localStorage
  useEffect(() => {
    const savedData = localStorage.getItem('financeData');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        dispatch({ type: 'LOAD_DATA', payload: parsedData });
      } catch (error) {
        console.error('Erro ao carregar dados do localStorage:', error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('financeData', JSON.stringify(state));
  }, [state]);

  const getTotalInvestments = (): number => {
    return state.settings.initialInvestment + 
           state.investments.reduce((sum, investment) => sum + investment.amount, 0);
  };

  const getInvestmentYield = (): number => {
    const totalInvestments = getTotalInvestments();
    return totalInvestments * (state.settings.monthlyYield / 100);
  };

  const getActiveFixedExpenses = (month: number, year: number): FixedExpense[] => {
    const targetDate = new Date(year, month, 1);
    
    return state.fixedExpenses.filter(expense => {
      const effectiveFrom = new Date(expense.effectiveFrom);
      const effectiveUntil = expense.effectiveUntil ? new Date(expense.effectiveUntil) : null;
      
      return effectiveFrom <= targetDate && (!effectiveUntil || effectiveUntil >= targetDate);
    });
  };

  const getMonthlyData = (month: number, year: number): MonthlyData => {
    const fixedExpenses = getActiveFixedExpenses(month, year);
    
    const variableExpenses = state.expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate.getMonth() === month && 
             expenseDate.getFullYear() === year &&
             (expense.type === 'variavel' || expense.paymentMethod === 'debito' || expense.paymentMethod === 'pix');
    });

    const creditCardExpenses = state.expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate.getMonth() === month && 
             expenseDate.getFullYear() === year &&
             expense.type === 'cartao_credito';
    });

    const cashMovements = state.cashMovements.filter(movement => {
      const movementDate = new Date(movement.date);
      return movementDate.getMonth() === month && movementDate.getFullYear() === year;
    });

    const investments = state.investments.filter(investment => {
      const investmentDate = new Date(investment.date);
      return investmentDate.getMonth() === month && investmentDate.getFullYear() === year;
    });

    return {
      month,
      year,
      fixedExpenses,
      variableExpenses,
      creditCardExpenses,
      cashMovements,
      investments
    };
  };

  const getCurrentBalance = (): number => {
    const totalIncome = state.cashMovements
      .filter(movement => movement.type === 'income')
      .reduce((sum, movement) => sum + movement.amount, 0);
    
    const totalOutcome = state.cashMovements
      .filter(movement => movement.type === 'outcome')
      .reduce((sum, movement) => sum + movement.amount, 0);
    
    return state.settings.initialBalance + totalIncome - totalOutcome;
  };

  const getDashboardData = (): DashboardData => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    // Gastos do mês atual
    const monthlyExpenses = state.expenses
      .filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
      })
      .reduce((sum, expense) => sum + expense.amount, 0);

    const currentBalance = getCurrentBalance();
    const totalInvestments = getTotalInvestments();
    const investmentYield = getInvestmentYield();
    
    // Projeção com rendimento apenas sobre investimentos
    const projectedBalance = currentBalance + investmentYield;
    
    const pendingFixedExpenses = getActiveFixedExpenses(currentMonth, currentYear)
      .filter(expense => !expense.isPaid).length;
    const pendingCreditCards = state.creditCards.filter(card => !card.isPaid).length;

    // Top usuários por movimentações
    const userStats = state.users.map(user => {
      const userMovements = state.cashMovements.filter(movement => movement.userId === user.id);
      const totalIncome = userMovements
        .filter(movement => movement.type === 'income')
        .reduce((sum, movement) => sum + movement.amount, 0);
      const totalOutcome = userMovements
        .filter(movement => movement.type === 'outcome')
        .reduce((sum, movement) => sum + movement.amount, 0);

      return {
        userId: user.id,
        userName: user.name,
        totalAmount: totalIncome - totalOutcome,
        type: totalIncome > totalOutcome ? 'income' : 'outcome' as 'income' | 'outcome'
      };
    }).sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));

    return {
      monthlyExpenses,
      currentBalance,
      projectedBalance,
      pendingFixedExpenses,
      pendingCreditCards,
      totalInvestments,
      investmentYield,
      topUsers: userStats
    };
  };

  const value: FinanceContextType = {
    state,
    dispatch,
    getDashboardData,
    getCurrentBalance,
    getTotalInvestments,
    getInvestmentYield,
    getMonthlyData,
    getActiveFixedExpenses
  };

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  );
};