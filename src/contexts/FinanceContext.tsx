import { createContext, useContext, useReducer, useEffect, useState, type ReactNode, type Dispatch } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { 
  User, Expense, FixedExpense, FixedIncome, CreditCard, CashMovement, 
  FinancialSettings, DashboardData, Investment, MonthlyFilter, MonthlyData,
  FixedPayment, FixedReceipt 
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
  fixedPayments: FixedPayment[];
  fixedReceipts: FixedReceipt[];
  settings: FinancialSettings;
  selectedMonth: MonthlyFilter;
  isLoading: boolean;
  currentAccountId: string | null;
  availableAccounts: { id: string, name: string }[];
}

const initialState: FinanceState = {
  users: [], expenses: [], fixedExpenses: [], fixedIncomes: [], creditCards: [], 
  cashMovements: [], investments: [], fixedPayments: [], fixedReceipts: [],
  settings: { monthlyYield: 0, initialBalance: 0, initialInvestment: 0 },
  selectedMonth: { month: new Date().getMonth(), year: new Date().getFullYear() },
  isLoading: true,
  currentAccountId: null,
  availableAccounts: []
};

// --- ACTIONS ---
type FinanceAction = 
  | { type: 'SET_DATA'; payload: Partial<FinanceState> }
  | { type: 'ADD_ITEM'; payload: { key: keyof FinanceState; item: any } }
  | { type: 'REMOVE_ITEM'; payload: { key: keyof FinanceState; id: string } }
  | { type: 'UPDATE_ITEM'; payload: { key: keyof FinanceState; id: string; updates: any } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<FinancialSettings> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SELECTED_MONTH'; payload: MonthlyFilter };

const financeReducer = (state: FinanceState, action: FinanceAction): FinanceState => {
  switch (action.type) {
    case 'SET_DATA': return { ...state, ...action.payload };
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'ADD_ITEM': return { ...state, [action.payload.key]: [action.payload.item, ...(state[action.payload.key] as any[])] };
    case 'REMOVE_ITEM': return { ...state, [action.payload.key]: (state[action.payload.key] as any[]).filter(item => item.id !== action.payload.id) };
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

const parseSupabaseDate = (dateString: string | Date) => {
  if (!dateString) return new Date();
  const d = new Date(dateString);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

interface FinanceContextType {
  state: FinanceState;
  dispatch: Dispatch<FinanceAction>;
  refreshData: (explicitAccountId?: string) => Promise<void>;
  switchAccount: (accountId: string) => Promise<void>;
  addUser: (user: { name: string; email?: string }) => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  addCashMovement: (movement: Omit<CashMovement, 'id' | 'createdAt'>) => Promise<void>;
  addFixedExpense: (expense: Omit<FixedExpense, 'id' | 'createdAt'>) => Promise<void>;
  updateFixedExpense: (id: string, updates: Partial<FixedExpense>) => Promise<void>;
  toggleFixedExpensePayment: (expenseId: string, month: number, year: number, amount: number) => Promise<void>;
  addFixedIncome: (income: Omit<FixedIncome, 'id' | 'createdAt'>) => Promise<void>;
  updateFixedIncome: (id: string, updates: Partial<FixedIncome>) => Promise<void>;
  toggleFixedIncomeReceipt: (incomeId: string, month: number, year: number, amount: number) => Promise<void>;
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
  getUserName: (userId: string) => string;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance deve ser usado dentro de FinanceProvider');
  return context;
};

export const FinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(financeReducer, initialState);
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  const refreshData = async (explicitAccountId?: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: memberships } = await supabase
        .from('account_members')
        .select(`account_id, accounts (id, name)`)
        .eq('user_id', user.id);

      if (!memberships || memberships.length === 0) {
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      const available = memberships.map(m => ({
        id: (m.accounts as any).id,
        name: (m.accounts as any).name
      }));

      const accId = explicitAccountId || state.currentAccountId || available[0].id;

      const { data: membersList } = await supabase
        .from('account_members')
        .select('user_id')
        .eq('account_id', accId);

      const memberIds = membersList?.map(m => m.user_id) || [];

      const [
        usersData,
        settingsData, expenses, 
        fixedExp, fixedInc,
        movements, cards, investments,
        fixedPayments, fixedReceipts 
      ] = await Promise.all([
        supabase.from('app_users').select('*').in('id', memberIds),
        supabase.from('financial_settings').select('*').eq('account_id', accId).maybeSingle(),
        supabase.from('expenses').select('*').eq('account_id', accId),
        supabase.from('fixed_expenses').select('*').eq('account_id', accId),
        supabase.from('fixed_incomes').select('*').eq('account_id', accId),
        supabase.from('cash_movements').select('*').eq('account_id', accId),
        supabase.from('credit_cards').select('*').eq('account_id', accId),
        supabase.from('investments').select('*').eq('account_id', accId),
        supabase.from('fixed_expense_payments').select('*').eq('account_id', accId),
        supabase.from('fixed_income_receipts').select('*').eq('account_id', accId),
      ]);

      let settings = settingsData.data;
      if (!settings && user) {
        const { data: newSettings } = await supabase.from('financial_settings').insert({
          user_id: user.id,
          account_id: accId,
          initial_balance: 0,
          monthly_yield: 0
        }).select().single();
        settings = newSettings;
      }

      const mappedUsers = usersData.data?.map(u => ({ id: u.id, name: u.name, createdAt: u.created_at ? new Date(u.created_at) : new Date(), email: u.email })) || [];
      const mappedFixedExp = fixedExp.data?.map(f => ({ id: f.id, name: f.name, category: f.category, amount: f.amount, dueDay: f.due_day, isPaid: false, createdAt: new Date(f.created_at), effectiveFrom: parseSupabaseDate(f.effective_from), effectiveUntil: f.effective_until ? parseSupabaseDate(f.effective_until) : undefined, creditCardId: f.credit_card_id })) || [];
      const mappedFixedInc = fixedInc.data?.map(f => ({ id: f.id, description: f.description, amount: f.amount, receiveDay: f.receive_day, isReceived: false, createdAt: new Date(f.created_at), effectiveFrom: parseSupabaseDate(f.effective_from), effectiveUntil: f.effective_until ? parseSupabaseDate(f.effective_until) : undefined })) || [];
      const mappedExpenses = expenses.data?.map(e => ({ id: e.id, description: e.description, amount: e.amount, type: e.type, category: e.category, paymentMethod: e.payment_method, date: parseSupabaseDate(e.date), userId: e.user_id, installments: { current: e.installments_current, total: e.installments_total }, createdAt: new Date(e.created_at) })) || [];
      const mappedMovements = movements.data?.map(m => ({ id: m.id, type: m.type, description: m.description, amount: m.amount, userId: m.user_id, date: parseSupabaseDate(m.date), createdAt: new Date(m.created_at) })) || [];
      const mappedCards = cards.data?.map(c => ({ id: c.id, name: c.name, limit: c.limit, closingDay: c.closing_day, dueDay: c.due_day, isPaid: c.is_paid, paidBy: c.paid_by, paidAt: c.paid_at ? new Date(c.paid_at) : undefined, createdAt: new Date(c.created_at) })) || [];
      const mappedInvestments = investments.data?.map(i => ({ id: i.id, description: i.description, amount: i.amount, date: parseSupabaseDate(i.date), userId: i.user_id, createdAt: new Date(i.created_at) })) || [];
      const mappedPayments = fixedPayments.data?.map(p => ({ id: p.id, fixedExpenseId: p.fixed_expense_id, month: p.month, year: p.year, amount: Number(p.amount), paidAt: new Date(p.paid_at), generatedExpenseId: p.generated_expense_id })) || [];
      const mappedReceipts = fixedReceipts.data?.map(r => ({ id: r.id, fixedIncomeId: r.fixed_income_id, month: r.month, year: r.year, amount: Number(r.amount), receivedAt: new Date(r.received_at) })) || [];

      dispatch({
        type: 'SET_DATA',
        payload: {
          users: mappedUsers,
          settings: settings ? { monthlyYield: settings.monthly_yield, initialBalance: settings.initial_balance, initialInvestment: settings.initial_investment || 0 } : initialState.settings,
          expenses: mappedExpenses, fixedExpenses: mappedFixedExp, fixedIncomes: mappedFixedInc,
          cashMovements: mappedMovements, creditCards: mappedCards, investments: mappedInvestments, 
          fixedPayments: mappedPayments, fixedReceipts: mappedReceipts, isLoading: false,
          currentAccountId: accId,
          availableAccounts: available
        }
      });
    } catch (error) {
      console.error(error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const switchAccount = async (accountId: string) => {
    await refreshData(accountId);
  };

  useEffect(() => { refreshData(); }, []);

  const addUser = async (userData: any) => { 
    const { data, error } = await supabase.from('app_users').insert(userData).select().single(); 
    if(error) throw error; 
    dispatch({ type: 'ADD_ITEM', payload: { key: 'users', item: data } }); 
  };
  
  const addCashMovement = async (movement: any) => { 
    if(!userId || !state.currentAccountId) return;
    const { data, error } = await supabase.from('cash_movements').insert({ 
        type: movement.type, description: movement.description, amount: movement.amount, 
        user_id: userId, account_id: state.currentAccountId, date: movement.date 
    }).select().single(); 
    if (error) throw error; 
    const newMovement = { ...data, date: parseSupabaseDate(data.date), userId: data.user_id, createdAt: new Date(data.created_at) }; 
    dispatch({ type: 'ADD_ITEM', payload: { key: 'cashMovements', item: newMovement } }); 
  };

  const addFixedExpense = async (expense: any) => { 
    if(!state.currentAccountId) return;
    const { data, error } = await supabase.from('fixed_expenses').insert({ 
        name: expense.name, category: expense.category, amount: expense.amount, 
        due_day: expense.dueDay, effective_from: expense.effectiveFrom, 
        credit_card_id: expense.creditCardId, account_id: state.currentAccountId 
    }).select().single(); 
    if (error) throw error; 
    const newItem: FixedExpense = { id: data.id, name: data.name, category: data.category, amount: data.amount, dueDay: data.due_day, isPaid: false, createdAt: new Date(data.created_at), effectiveFrom: parseSupabaseDate(data.effective_from), creditCardId: data.credit_card_id }; 
    dispatch({ type: 'ADD_ITEM', payload: { key: 'fixedExpenses', item: newItem } }); 
  };

  const updateFixedExpense = async (id: string, updates: any) => { 
    const { error } = await supabase.from('fixed_expenses').update({ name: updates.name, amount: updates.amount }).eq('id', id); 
    if (error) throw error; 
    dispatch({ type: 'UPDATE_ITEM', payload: { key: 'fixedExpenses', id, updates } }); 
  };
  
  const toggleFixedExpensePayment = async (expenseId: string, month: number, year: number, amount: number) => {
    if(!state.currentAccountId || !userId) return;
    const existingPayment = state.fixedPayments.find(p => p.fixedExpenseId === expenseId && p.month === month && p.year === year);
    
    if (existingPayment) {
      if (existingPayment.generatedExpenseId) {
          await supabase.from('expenses').delete().eq('id', existingPayment.generatedExpenseId);
          dispatch({ type: 'REMOVE_ITEM', payload: { key: 'expenses', id: existingPayment.generatedExpenseId } });
      }
      const { error } = await supabase.from('fixed_expense_payments').delete().eq('id', existingPayment.id);
      if (error) throw error;
      dispatch({ type: 'SET_DATA', payload: { fixedPayments: state.fixedPayments.filter(p => p.id !== existingPayment.id) } });
      toast({ title: "Pagamento estornado!" });
    } else {
      const fixedExpense = state.fixedExpenses.find(e => e.id === expenseId);
      if (!fixedExpense) return;
      let generatedExpenseId = null;

      if (fixedExpense.creditCardId) {
         const creditCard = state.creditCards.find(c => c.id === fixedExpense.creditCardId);
         if (creditCard) {
            const { data: expenseData, error: expenseError } = await supabase.from('expenses').insert({ 
                user_id: userId, account_id: state.currentAccountId, description: `${fixedExpense.name} (Fixo)`, 
                amount, type: 'cartao_credito', category: fixedExpense.category, payment_method: creditCard.name, 
                date: new Date(year, month, fixedExpense.dueDay), installments_current: 1, installments_total: 1 
            }).select().single();
            if (!expenseError && expenseData) {
               generatedExpenseId = expenseData.id;
               dispatch({ type: 'ADD_ITEM', payload: { key: 'expenses', item: { ...expenseData, date: parseSupabaseDate(expenseData.date), userId: expenseData.user_id, paymentMethod: expenseData.payment_method, createdAt: new Date(expenseData.created_at) } } });
            }
         }
      }

      const { data, error } = await supabase.from('fixed_expense_payments').insert({ 
          fixed_expense_id: expenseId, month, year, amount, 
          generated_expense_id: generatedExpenseId, account_id: state.currentAccountId 
      }).select().single();
      if (error) throw error;
      dispatch({ type: 'SET_DATA', payload: { fixedPayments: [...state.fixedPayments, { id: data.id, fixedExpenseId: data.fixed_expense_id, month: data.month, year: data.year, amount: Number(data.amount), paidAt: new Date(data.paid_at), generatedExpenseId: data.generated_expense_id }] } });
      toast({ title: "Conta paga!" });
    }
  };

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
    if (!userId || !state.currentAccountId) return;
    try {
      const { amount, description, date, installments, type, category, paymentMethod } = expenseData;
      const totalInst = installments?.total || 1;
      if (type === 'cartao_credito' && totalInst > 1) {
        const instVal = amount / totalInst;
        const toInsert = Array.from({ length: totalInst }, (_, i) => ({ 
            user_id: userId, account_id: state.currentAccountId, description: `${description} (${i + 1}/${totalInst})`, 
            amount: instVal, type, category, payment_method: paymentMethod, 
            date: new Date(new Date(date).setMonth(new Date(date).getMonth() + i)), 
            installments_current: i + 1, installments_total: totalInst 
        }));
        const { error } = await supabase.from('expenses').insert(toInsert);
        if (error) throw error;
        refreshData();
      } else {
        const { data, error } = await supabase.from('expenses').insert({ 
            description, amount, type, category, payment_method: paymentMethod, 
            date, user_id: userId, account_id: state.currentAccountId, installments_current: 1, installments_total: 1 
        }).select().single();
        if (error) throw error;
        dispatch({ type: 'ADD_ITEM', payload: { key: 'expenses', item: { ...data, date: parseSupabaseDate(data.date), userId: data.user_id, paymentMethod: data.payment_method, createdAt: new Date(data.created_at) } } });
      }
    } catch (error: any) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
  };

  const toggleFixedIncomeReceipt = async (incomeId: string, month: number, year: number, amount: number) => {
    if(!state.currentAccountId) return;
    const existingReceipt = state.fixedReceipts.find(r => r.fixedIncomeId === incomeId && r.month === month && r.year === year);
    if (existingReceipt) {
      const { error } = await supabase.from('fixed_income_receipts').delete().eq('id', existingReceipt.id);
      if (error) throw error;
      dispatch({ type: 'SET_DATA', payload: { fixedReceipts: state.fixedReceipts.filter(r => r.id !== existingReceipt.id) } });
      toast({ title: "Recebimento estornado!" });
    } else {
      const { data, error } = await supabase.from('fixed_income_receipts').insert({ 
          fixed_income_id: incomeId, month, year, amount, account_id: state.currentAccountId 
      }).select().single();
      if (error) throw error;
      dispatch({ type: 'SET_DATA', payload: { fixedReceipts: [...state.fixedReceipts, { id: data.id, fixedIncomeId: data.fixed_income_id, month: data.month, year: data.year, amount: Number(data.amount), receivedAt: new Date(data.received_at) }] } });
      toast({ title: "Valor recebido!" });
    }
  };
  
  const addFixedIncome = async (income: any) => { 
    if(!state.currentAccountId) return;
    const { data, error } = await supabase.from('fixed_incomes').insert({ 
        description: income.description, amount: income.amount, receive_day: income.receive_day, 
        effective_from: income.effectiveFrom, account_id: state.currentAccountId 
    }).select().single(); 
    if (error) throw error; 
    dispatch({ type: 'ADD_ITEM', payload: { key: 'fixedIncomes', item: { id: data.id, description: data.description, amount: data.amount, receiveDay: data.receive_day, isReceived: false, createdAt: new Date(data.created_at), effectiveFrom: parseSupabaseDate(data.effective_from) } } }); 
  };
  
  const updateFixedIncome = async (id: string, updates: any) => { 
    const { error } = await supabase.from('fixed_incomes').update({ is_received: updates.isReceived, received_by: updates.receivedBy, received_at: updates.receivedAt }).eq('id', id); 
    if (error) throw error; 
    dispatch({ type: 'UPDATE_ITEM', payload: { key: 'fixedIncomes', id, updates } }); 
  };

  const addCreditCard = async (card: any) => { 
    if(!state.currentAccountId) return;
    const { data, error } = await supabase.from('credit_cards').insert({ 
        name: card.name, limit: card.limit, closing_day: card.closingDay, due_day: card.dueDay, 
        is_paid: false, account_id: state.currentAccountId 
    }).select().single(); 
    if(error) throw error; 
    dispatch({ type: 'ADD_ITEM', payload: { key: 'creditCards', item: { id: data.id, name: data.name, limit: data.limit, closingDay: data.closing_day, dueDay: data.due_day, isPaid: data.is_paid, createdAt: new Date(data.created_at) } } }); 
  };
  
  const updateCreditCard = async (id: string, updates: any) => { 
    const { error } = await supabase.from('credit_cards').update({ is_paid: updates.isPaid, paid_by: updates.paidBy, paid_at: updates.paidAt }).eq('id', id); 
    if (error) throw error; 
    dispatch({ type: 'UPDATE_ITEM', payload: { key: 'creditCards', id, updates } }); 
  };
  
  const addInvestment = async (investment: any) => { 
    if (!userId || !state.currentAccountId) return; 
    const { data, error } = await supabase.from('investments').insert({ 
        description: investment.description, amount: investment.amount, 
        date: investment.date, user_id: userId, account_id: state.currentAccountId 
    }).select().single(); 
    if(error) throw error; 
    dispatch({ type: 'ADD_ITEM', payload: { key: 'investments', item: { id: data.id, description: data.description, amount: data.amount, date: parseSupabaseDate(data.date), userId: data.user_id, createdAt: new Date(data.created_at) } } }); 
  };
  
  const updateSettings = async (settings: Partial<FinancialSettings>) => { 
    if(!state.currentAccountId) return;
    const dbPayload: any = {}; 
    if(settings.monthlyYield !== undefined) dbPayload.monthly_yield = settings.monthlyYield; 
    if(settings.initialBalance !== undefined) dbPayload.initial_balance = settings.initialBalance; 
    
    const { error } = await supabase.from('financial_settings').update(dbPayload).eq('account_id', state.currentAccountId); 
    if(error) throw error;
    dispatch({ type: 'UPDATE_SETTINGS', payload: settings }); 
  };

  const getTotalInvestments = () => state.settings.initialInvestment + state.investments.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const getInvestmentYield = () => getTotalInvestments() * (state.settings.monthlyYield / 100);
  
  const getActiveFixedExpenses = (month: number, year: number) => {
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const startOfMonth = new Date(year, month, 1, 0, 0, 0);
    return state.fixedExpenses.filter(expense => {
      const effectiveFrom = new Date(expense.effectiveFrom);
      const effectiveUntil = expense.effectiveUntil ? new Date(expense.effectiveUntil) : null;
      return effectiveFrom <= endOfMonth && (!effectiveUntil || effectiveUntil >= startOfMonth);
    }).map(expense => {
      const payment = state.fixedPayments.find(p => p.fixedExpenseId === expense.id && p.month === month && p.year === year);
      return { ...expense, isPaid: !!payment, paidAt: payment?.paidAt };
    });
  };

  const getActiveFixedIncomes = (month: number, year: number) => {
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const startOfMonth = new Date(year, month, 1, 0, 0, 0);
    return state.fixedIncomes.filter(income => {
      const effectiveFrom = new Date(income.effectiveFrom);
      const effectiveUntil = income.effectiveUntil ? new Date(income.effectiveUntil) : null;
      return effectiveFrom <= endOfMonth && (!effectiveUntil || effectiveUntil >= startOfMonth);
    }).map(income => {
      const receipt = state.fixedReceipts.find(r => r.fixedIncomeId === income.id && r.month === month && r.year === year);
      return { ...income, isReceived: !!receipt, receivedAt: receipt?.receivedAt };
    });
  };

  const getCurrentBalance = (): number => {
    const cashIncome = state.cashMovements.filter(m => m.type === 'income').reduce((acc, m) => acc + Number(m.amount), 0);
    const fixedIncomeReceived = state.fixedReceipts.reduce((acc, r) => acc + Number(r.amount), 0);
    const cashOutcome = state.cashMovements.filter(m => m.type === 'outcome').reduce((acc, m) => acc + Number(m.amount), 0);
    const immediateExpenses = state.expenses.filter(e => e.paymentMethod === 'debito' || e.paymentMethod === 'pix' || e.paymentMethod === 'dinheiro').reduce((sum, e) => sum + Number(e.amount), 0);
    const fixedExpensesPaidCash = state.fixedPayments.reduce((sum, payment) => {
      const expense = state.fixedExpenses.find(e => e.id === payment.fixedExpenseId);
      return (expense && expense.creditCardId) ? sum : sum + Number(payment.amount);
    }, 0);
    return Number(state.settings.initialBalance) + cashIncome + fixedIncomeReceived - cashOutcome - immediateExpenses - fixedExpensesPaidCash;
  };

  const getDashboardData = (): DashboardData => {
    const { month: currentMonth, year: currentYear } = state.selectedMonth;
    const expensesOfMonth = state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === currentMonth && d.getFullYear() === currentYear; });
    const generatedIds = state.fixedPayments.map(p => p.generatedExpenseId).filter((id): id is string => !!id);
    const variableExpenses = expensesOfMonth.filter(e => !generatedIds.includes(e.id)).reduce((sum, e) => sum + Number(e.amount), 0);
    const cashIncome = state.cashMovements.filter(m => { const d = new Date(m.date); return m.type === 'income' && d.getMonth() === currentMonth && d.getFullYear() === currentYear; }).reduce((sum, m) => sum + Number(m.amount), 0);
    const activeFixedExp = getActiveFixedExpenses(currentMonth, currentYear);
    const activeFixedInc = getActiveFixedIncomes(currentMonth, currentYear);
    
    const pendingCreditCardList = state.creditCards.filter(c => !c.isPaid).map(card => ({
      ...card,
      billAmount: expensesOfMonth.filter(e => e.paymentMethod === card.name).reduce((sum, e) => sum + Number(e.amount), 0)
    }));

    const pendingFixedList = activeFixedExp.filter(e => !e.isPaid);
    const pendingFixedToPay = pendingFixedList.filter(e => !e.creditCardId).reduce((sum, e) => sum + Number(e.amount), 0);
    const pendingFixedToReceive = activeFixedInc.filter(i => !i.isReceived).reduce((sum, i) => sum + Number(i.amount), 0);
    const currentBalance = getCurrentBalance();
    const investmentYield = getInvestmentYield();
    const pendingCardsTotal = pendingCreditCardList.reduce((sum, c) => sum + c.billAmount, 0);
    const projectedBalance = currentBalance + pendingFixedToReceive - pendingFixedToPay - pendingCardsTotal;

    return { 
      totalIncome: activeFixedInc.reduce((sum, i) => sum + Number(i.amount), 0) + cashIncome,
      totalFixedExpenses: activeFixedExp.reduce((sum, e) => sum + Number(e.amount), 0),
      variableExpenses, totalInvestments: getTotalInvestments(), projectedBalance, currentBalance, 
      pendingIncomeValue: pendingFixedToReceive, pendingFixedExpensesValue: pendingFixedToPay,
      pendingFixedExpenses: pendingFixedList.length, pendingFixedList, pendingCreditCards: pendingCreditCardList.length, pendingCreditCardList, investmentYield, 
      topUsers: state.users.map(u => ({ userId: u.id, userName: u.name, totalAmount: expensesOfMonth.filter(e => e.userId === u.id && !generatedIds.includes(e.id)).reduce((acc, e) => acc + Number(e.amount), 0), type: 'outcome' as 'income' | 'outcome' })).sort((a, b) => b.totalAmount - a.totalAmount)
    };
  };

  const getMonthlyData = (month: number, year: number): MonthlyData => ({
    month, year, 
    fixedExpenses: getActiveFixedExpenses(month, year),
    variableExpenses: state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === month && d.getFullYear() === year && e.type === 'variavel'; }),
    creditCardExpenses: state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === month && d.getFullYear() === year && e.type === 'cartao_credito'; }),
    cashMovements: state.cashMovements.filter(m => { const d = new Date(m.date); return d.getMonth() === month && d.getFullYear() === year; }),
    investments: state.investments.filter(i => { const d = new Date(i.date); return d.getMonth() === month && d.getFullYear() === year; })
  });

  const getUserName = (userId: string) => state.users.find(u => u.id === userId)?.name || '---';

  return (
    <FinanceContext.Provider value={{ 
      state, dispatch, refreshData, switchAccount, addUser, addExpense, addCashMovement, addFixedExpense, updateFixedExpense, toggleFixedExpensePayment, 
      addFixedIncome, updateFixedIncome, toggleFixedIncomeReceipt, addCreditCard, updateCreditCard, updateSettings, addInvestment, 
      getDashboardData, getMonthlyData, getActiveFixedExpenses, getActiveFixedIncomes, getCurrentBalance, getTotalInvestments, getInvestmentYield, getUserName 
    }}>
      {children}
    </FinanceContext.Provider>
  );
};