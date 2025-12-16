import { createContext, useContext, useReducer, useEffect, useState, type ReactNode, type Dispatch } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { 
  User, Expense, FixedExpense, FixedIncome, CreditCard, CashMovement, 
  FinancialSettings, DashboardData, Investment, MonthlyFilter, MonthlyData
} from '@/types';

// --- STATE ---
interface FinanceState {
  users: User[];
  expenses: Expense[];
  fixedExpenses: FixedExpense[];
  fixedIncomes: FixedIncome[];
  creditCards: CreditCard[];
  cashMovements: CashMovement[];
  investments: Investment[];
  settings: FinancialSettings;
  selectedMonth: MonthlyFilter;
  isLoading: boolean;
}

const initialState: FinanceState = {
  users: [],
  expenses: [],
  fixedExpenses: [],
  fixedIncomes: [],
  creditCards: [],
  cashMovements: [],
  investments: [],
  settings: { monthlyYield: 0.5, initialBalance: 0, initialInvestment: 0 },
  selectedMonth: { month: new Date().getMonth(), year: new Date().getFullYear() },
  isLoading: true
};

// --- ACTIONS ---
type FinanceAction = 
  | { type: 'SET_DATA'; payload: Partial<FinanceState> }
  | { type: 'ADD_ITEM'; payload: { key: keyof FinanceState; item: any } }
  | { type: 'UPDATE_ITEM'; payload: { key: keyof FinanceState; id: string; updates: any } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<FinancialSettings> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SELECTED_MONTH'; payload: MonthlyFilter };

const financeReducer = (state: FinanceState, action: FinanceAction): FinanceState => {
  switch (action.type) {
    case 'SET_DATA': return { ...state, ...action.payload };
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'ADD_ITEM': return { ...state, [action.payload.key]: [action.payload.item, ...(state[action.payload.key] as any[])] };
    case 'UPDATE_ITEM': return {
      ...state,
      [action.payload.key]: (state[action.payload.key] as any[]).map(item => 
        item.id === action.payload.id ? { ...item, ...action.payload.updates } : item
      )
    };
    case 'UPDATE_SETTINGS': return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_SELECTED_MONTH': return { ...state, selectedMonth: action.payload };
    default: return state;
  }
};

// --- CONTEXT INTERFACE ---
interface FinanceContextType {
  state: FinanceState;
  dispatch: Dispatch<FinanceAction>;
  refreshData: () => Promise<void>;
  addUser: (user: { name: string; email?: string }) => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  addCashMovement: (movement: Omit<CashMovement, 'id' | 'createdAt'>) => Promise<void>;
  addFixedExpense: (expense: Omit<FixedExpense, 'id' | 'createdAt'>) => Promise<void>;
  updateFixedExpense: (id: string, updates: Partial<FixedExpense>) => Promise<void>;
  addFixedIncome: (income: Omit<FixedIncome, 'id' | 'createdAt'>) => Promise<void>;
  updateFixedIncome: (id: string, updates: Partial<FixedIncome>) => Promise<void>;
  addCreditCard: (card: Omit<CreditCard, 'id' | 'createdAt'>) => Promise<void>;
  updateCreditCard: (id: string, updates: Partial<CreditCard>) => Promise<void>;
  addInvestment: (investment: Omit<Investment, 'id' | 'createdAt'>) => Promise<void>;
  updateSettings: (settings: Partial<FinancialSettings>) => Promise<void>;
  getDashboardData: () => DashboardData;
  getMonthlyData: (month: number, year: number) => MonthlyData;
  getActiveFixedExpenses: (month: number, year: number) => FixedExpense[];
  getActiveFixedIncomes: (month: number, year: number) => FixedIncome[];
  getCurrentBalance: () => number;
  getTotalInvestments: () => number;
  getInvestmentYield: () => number;
  // ✅ ADICIONADO: Definição da função getUserName
  getUserName: (userId: string) => string;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance deve ser usado within FinanceProvider');
  return context;
};

// --- PROVIDER ---
export const FinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(financeReducer, initialState);
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  const refreshData = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const [
        { data: users }, { data: settings }, { data: expenses }, 
        { data: fixedExp }, { data: fixedInc },
        { data: movements }, { data: cards }, { data: investments }
      ] = await Promise.all([
        supabase.from('app_users').select('*'),
        supabase.from('financial_settings').select('*').single(),
        supabase.from('expenses').select('*'),
        supabase.from('fixed_expenses').select('*'),
        supabase.from('fixed_incomes').select('*'),
        supabase.from('cash_movements').select('*'),
        supabase.from('credit_cards').select('*'),
        supabase.from('investments').select('*'),
      ]);

      const mappedUsers = users?.map(u => ({ id: u.id, name: u.name, createdAt: u.created_at ? new Date(u.created_at) : new Date(), email: u.email })) || [];
      const mappedFixedExp = fixedExp?.map(f => ({ id: f.id, name: f.name, category: f.category, amount: f.amount, dueDay: f.due_day, isPaid: f.is_paid, paidBy: f.paid_by, paidAt: f.paid_at ? new Date(f.paid_at) : undefined, createdAt: new Date(f.created_at), effectiveFrom: new Date(f.effective_from), effectiveUntil: f.effective_until ? new Date(f.effective_until) : undefined })) || [];
      const mappedFixedInc = fixedInc?.map(f => ({ id: f.id, description: f.description, amount: f.amount, receiveDay: f.receive_day, isReceived: f.is_received, receivedBy: f.received_by, receivedAt: f.received_at ? new Date(f.received_at) : undefined, createdAt: new Date(f.created_at), effectiveFrom: new Date(f.effective_from), effectiveUntil: f.effective_until ? new Date(f.effective_until) : undefined })) || [];
      const mappedExpenses = expenses?.map(e => ({ id: e.id, description: e.description, amount: e.amount, type: e.type, category: e.category, paymentMethod: e.payment_method, date: new Date(e.date), userId: e.user_id, installments: { current: e.installments_current, total: e.installments_total }, createdAt: new Date(e.created_at) })) || [];
      const mappedMovements = movements?.map(m => ({ id: m.id, type: m.type, description: m.description, amount: m.amount, userId: m.user_id, date: new Date(m.date), createdAt: new Date(m.created_at) })) || [];
      const mappedCards = cards?.map(c => ({ id: c.id, name: c.name, limit: c.limit, closingDay: c.closing_day, dueDay: c.due_day, isPaid: c.is_paid, paidBy: c.paid_by, paidAt: c.paid_at ? new Date(c.paid_at) : undefined, createdAt: new Date(c.created_at) })) || [];
      const mappedInvestments = investments?.map(i => ({ id: i.id, description: i.description, amount: i.amount, date: new Date(i.date), userId: i.user_id, createdAt: new Date(i.created_at) })) || [];

      dispatch({
        type: 'SET_DATA',
        payload: {
          users: mappedUsers,
          settings: settings ? { monthlyYield: settings.monthly_yield, initialBalance: settings.initial_balance, initialInvestment: settings.initial_investment } : initialState.settings,
          expenses: mappedExpenses, fixedExpenses: mappedFixedExp, fixedIncomes: mappedFixedInc,
          cashMovements: mappedMovements, creditCards: mappedCards, investments: mappedInvestments, isLoading: false
        }
      });
    } catch (error) {
      console.error(error);
      toast({ title: "Erro ao carregar dados", variant: "destructive" });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  useEffect(() => { refreshData(); }, []);

  // --- ACTIONS ---
  const addUser = async (userData: any) => { const { data, error } = await supabase.from('app_users').insert(userData).select().single(); if(error) throw error; dispatch({ type: 'ADD_ITEM', payload: { key: 'users', item: data } }); };
  
  const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
    if (!userId) return;
    try {
      const { amount, description, date, installments, type, category, paymentMethod, userId: formUserId } = expenseData;
      const currentInstallments = installments?.total || 1;

      if (type === 'cartao_credito' && currentInstallments > 1) {
        const installmentValue = amount / currentInstallments;
        const expensesToInsert = [];
        for (let i = 0; i < currentInstallments; i++) {
          const installmentDate = new Date(date);
          installmentDate.setMonth(installmentDate.getMonth() + i);
          expensesToInsert.push({
            user_id: formUserId || userId,
            description: `${description} (${i + 1}/${currentInstallments})`,
            amount: installmentValue,
            type: type,
            category: category,
            payment_method: paymentMethod,
            date: installmentDate,
            installments_current: i + 1,
            installments_total: currentInstallments
          });
        }
        const { error } = await supabase.from('expenses').insert(expensesToInsert);
        if (error) throw error;
        refreshData(); 
        toast({ title: "Compra parcelada registrada!", description: `${currentInstallments} parcelas geradas.` });
      } else {
        const dbPayload = { description, amount, type, category, payment_method: paymentMethod, date, user_id: formUserId || userId, installments_current: 1, installments_total: 1 };
        const { data, error } = await supabase.from('expenses').insert(dbPayload).select().single();
        if (error) throw error;
        const newExpense = { ...data, date: new Date(data.date), userId: data.user_id, paymentMethod: data.payment_method, createdAt: new Date(data.created_at) };
        dispatch({ type: 'ADD_ITEM', payload: { key: 'expenses', item: newExpense } });
        toast({ title: "Despesa salva!" });
      }
    } catch (error: any) {
      console.error(error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const addCashMovement = async (movement: any) => { if (!userId) return; const { data, error } = await supabase.from('cash_movements').insert({ type: movement.type, description: movement.description, amount: movement.amount, user_id: movement.userId || userId, date: movement.date }).select().single(); if (error) throw error; const newMovement = { ...data, date: new Date(data.date), userId: data.user_id, createdAt: new Date(data.created_at) }; dispatch({ type: 'ADD_ITEM', payload: { key: 'cashMovements', item: newMovement } }); };
  const addFixedExpense = async (expense: any) => { const dbPayload = { name: expense.name, category: expense.category, amount: expense.amount, due_day: expense.dueDay, is_paid: expense.isPaid, effective_from: expense.effectiveFrom }; const { data, error } = await supabase.from('fixed_expenses').insert(dbPayload).select().single(); if (error) throw error; const newItem: FixedExpense = { id: data.id, name: data.name, category: data.category, amount: data.amount, dueDay: data.due_day, isPaid: data.is_paid, createdAt: new Date(data.created_at), effectiveFrom: new Date(data.effective_from) }; dispatch({ type: 'ADD_ITEM', payload: { key: 'fixedExpenses', item: newItem } }); };
  const updateFixedExpense = async (id: string, updates: any) => { const dbUpdates: any = {}; if (updates.isPaid !== undefined) dbUpdates.is_paid = updates.isPaid; if (updates.paidBy !== undefined) dbUpdates.paid_by = updates.paidBy; if (updates.paidAt !== undefined) dbUpdates.paid_at = updates.paidAt; const { error } = await supabase.from('fixed_expenses').update(dbUpdates).eq('id', id); if (error) throw error; dispatch({ type: 'UPDATE_ITEM', payload: { key: 'fixedExpenses', id, updates } }); };
  const addCreditCard = async (card: any) => { const dbPayload = { name: card.name, limit: card.limit, closing_day: card.closingDay, due_day: card.dueDay, is_paid: card.isPaid }; const { data, error } = await supabase.from('credit_cards').insert(dbPayload).select().single(); if(error) throw error; const newCard = { id: data.id, name: data.name, limit: data.limit, closingDay: data.closing_day, dueDay: data.due_day, isPaid: data.is_paid, createdAt: new Date(data.created_at) }; dispatch({ type: 'ADD_ITEM', payload: { key: 'creditCards', item: newCard } }); };
  const updateCreditCard = async (id: string, updates: any) => { const dbUpdates: any = {}; if (updates.isPaid !== undefined) dbUpdates.is_paid = updates.isPaid; if (updates.paidBy !== undefined) dbUpdates.paid_by = updates.paidBy; if (updates.paidAt !== undefined) dbUpdates.paid_at = updates.paidAt; const { error } = await supabase.from('credit_cards').update(dbUpdates).eq('id', id); if (error) throw error; dispatch({ type: 'UPDATE_ITEM', payload: { key: 'creditCards', id, updates } }); };
  const addInvestment = async (investment: any) => { if (!userId) return; const { data, error } = await supabase.from('investments').insert({ description: investment.description, amount: investment.amount, date: investment.date, user_id: investment.userId || userId }).select().single(); if(error) throw error; const newInvestment = { id: data.id, description: data.description, amount: data.amount, date: new Date(data.date), userId: data.user_id, createdAt: new Date(data.created_at) }; dispatch({ type: 'ADD_ITEM', payload: { key: 'investments', item: newInvestment } }); };
  const updateSettings = async (settings: any) => { const dbPayload: any = {}; if(settings.monthlyYield !== undefined) dbPayload.monthly_yield = settings.monthlyYield; if(settings.initialInvestment !== undefined) dbPayload.initial_investment = settings.initialInvestment; if(settings.initialBalance !== undefined) dbPayload.initial_balance = settings.initialBalance; const { data: currentSettings } = await supabase.from('financial_settings').select('id').single(); if(currentSettings) { await supabase.from('financial_settings').update(dbPayload).eq('id', currentSettings.id); } else { await supabase.from('financial_settings').insert(dbPayload); } dispatch({ type: 'UPDATE_SETTINGS', payload: settings }); };
  const addFixedIncome = async (income: any) => { const dbPayload = { description: income.description, amount: income.amount, receive_day: income.receiveDay, is_received: income.isReceived, effective_from: income.effectiveFrom }; const { data, error } = await supabase.from('fixed_incomes').insert(dbPayload).select().single(); if (error) throw error; const newItem: FixedIncome = { id: data.id, description: data.description, amount: data.amount, receiveDay: data.receive_day, isReceived: data.is_received, createdAt: new Date(data.created_at), effectiveFrom: new Date(data.effective_from) }; dispatch({ type: 'ADD_ITEM', payload: { key: 'fixedIncomes', item: newItem } }); toast({ title: "Entrada fixa salva!" }); };
  const updateFixedIncome = async (id: string, updates: any) => { const dbUpdates: any = {}; if (updates.isReceived !== undefined) dbUpdates.is_received = updates.isReceived; if (updates.receivedBy !== undefined) dbUpdates.received_by = updates.receivedBy; if (updates.receivedAt !== undefined) dbUpdates.received_at = updates.receivedAt; const { error } = await supabase.from('fixed_incomes').update(dbUpdates).eq('id', id); if (error) throw error; dispatch({ type: 'UPDATE_ITEM', payload: { key: 'fixedIncomes', id, updates } }); };

  // --- GETTERS ---
  const getTotalInvestments = () => state.settings.initialInvestment + state.investments.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const getInvestmentYield = () => getTotalInvestments() * (state.settings.monthlyYield / 100);
  
  const getActiveFixedExpenses = (month: number, year: number) => {
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const startOfMonth = new Date(year, month, 1, 0, 0, 0);
    return state.fixedExpenses.filter(expense => {
      const effectiveFrom = new Date(expense.effectiveFrom);
      const effectiveUntil = expense.effectiveUntil ? new Date(expense.effectiveUntil) : null;
      const isActiveStarted = effectiveFrom <= endOfMonth;
      const isNotEnded = !effectiveUntil || effectiveUntil >= startOfMonth;
      return isActiveStarted && isNotEnded;
    });
  };

  const getActiveFixedIncomes = (month: number, year: number) => {
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const startOfMonth = new Date(year, month, 1, 0, 0, 0);
    return state.fixedIncomes.filter(income => {
      const effectiveFrom = new Date(income.effectiveFrom);
      const effectiveUntil = income.effectiveUntil ? new Date(income.effectiveUntil) : null;
      const isActiveStarted = effectiveFrom <= endOfMonth;
      const isNotEnded = !effectiveUntil || effectiveUntil >= startOfMonth;
      return isActiveStarted && isNotEnded;
    });
  };

  const getMonthlyData = (month: number, year: number): MonthlyData => {
    const fixedExpenses = getActiveFixedExpenses(month, year);
    const variableExpenses = state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === month && d.getFullYear() === year && e.type === 'variavel'; });
    const creditCardExpenses = state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === month && d.getFullYear() === year && e.type === 'cartao_credito'; });
    const cashMovements = state.cashMovements.filter(m => { const d = new Date(m.date); return d.getMonth() === month && d.getFullYear() === year; });
    const investments = state.investments.filter(i => { const d = new Date(i.date); return d.getMonth() === month && d.getFullYear() === year; });
    return { month, year, fixedExpenses, variableExpenses, creditCardExpenses, cashMovements, investments };
  };

  const getCurrentBalance = (): number => {
    const cashIncome = state.cashMovements.filter(m => m.type === 'income').reduce((acc, m) => acc + Number(m.amount), 0);
    const fixedIncomeReceived = state.fixedIncomes.filter(i => i.isReceived).reduce((acc, i) => acc + Number(i.amount), 0);
    const cashOutcome = state.cashMovements.filter(m => m.type === 'outcome').reduce((acc, m) => acc + Number(m.amount), 0);
    const monthlyExpenses = state.expenses.filter(e => e.type === 'variavel').reduce((sum, e) => sum + Number(e.amount), 0);
    const fixedExpensesPaid = state.fixedExpenses.filter(e => e.isPaid).reduce((sum, e) => sum + Number(e.amount), 0);
    return Number(state.settings.initialBalance) + cashIncome + fixedIncomeReceived - cashOutcome - monthlyExpenses - fixedExpensesPaid;
  };

  const getDashboardData = (): DashboardData => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyExpenses = state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === currentMonth && d.getFullYear() === currentYear && e.type === 'variavel'; }).reduce((sum, e) => sum + Number(e.amount), 0);
    const currentBalance = getCurrentBalance();
    const totalInvestments = getTotalInvestments();
    const investmentYield = getInvestmentYield();
    const projectedBalance = currentBalance + investmentYield;
    const userStats = state.users.map(u => ({ userId: u.id, userName: u.name, totalAmount: state.expenses.filter(e => e.userId === u.id).reduce((acc, e) => acc + Number(e.amount), 0), type: 'outcome' as 'income' | 'outcome' })).sort((a, b) => b.totalAmount - a.totalAmount);
    return { monthlyExpenses, currentBalance, projectedBalance, pendingFixedExpenses: state.fixedExpenses.filter(f => !f.isPaid).length, pendingCreditCards: state.creditCards.filter(c => !c.isPaid).length, totalInvestments, investmentYield, topUsers: userStats };
  };

  // ✅ ADICIONADO: Implementação da função
  const getUserName = (userId: string) => {
    const user = state.users.find(u => u.id === userId);
    return user ? user.name : '---';
  };

  const value = {
    state, dispatch, refreshData, addUser, addExpense, addCashMovement, 
    addFixedExpense, updateFixedExpense, addFixedIncome, updateFixedIncome,
    addCreditCard, updateCreditCard, updateSettings, addInvestment,
    getDashboardData, getMonthlyData, getActiveFixedExpenses, getActiveFixedIncomes,
    getCurrentBalance, getTotalInvestments, getInvestmentYield,
    getUserName // ✅ ADICIONADO NO EXPORT
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};