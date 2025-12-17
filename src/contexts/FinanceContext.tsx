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
}

const initialState: FinanceState = {
  users: [], expenses: [], fixedExpenses: [], fixedIncomes: [], creditCards: [], 
  cashMovements: [], investments: [], fixedPayments: [], fixedReceipts: [],
  settings: { monthlyYield: 0.5, initialBalance: 0, initialInvestment: 0 },
  selectedMonth: { month: new Date().getMonth(), year: new Date().getFullYear() },
  isLoading: true
};

// --- ACTIONS ---
type FinanceAction = 
  | { type: 'SET_DATA'; payload: Partial<FinanceState> }
  | { type: 'ADD_ITEM'; payload: { key: keyof FinanceState; item: any } }
  | { type: 'REMOVE_ITEM'; payload: { key: keyof FinanceState; id: string } } // <--- Action Nova
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
  refreshData: () => Promise<void>;
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
  if (!context) throw new Error('useFinance deve ser usado within FinanceProvider');
  return context;
};

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
        { data: movements }, { data: cards }, { data: investments },
        { data: fixedPayments }, { data: fixedReceipts } 
      ] = await Promise.all([
        supabase.from('app_users').select('*'),
        supabase.from('financial_settings').select('*').single(),
        supabase.from('expenses').select('*'),
        supabase.from('fixed_expenses').select('*'),
        supabase.from('fixed_incomes').select('*'),
        supabase.from('cash_movements').select('*'),
        supabase.from('credit_cards').select('*'),
        supabase.from('investments').select('*'),
        supabase.from('fixed_expense_payments').select('*'),
        supabase.from('fixed_income_receipts').select('*'),
      ]);

      const mappedUsers = users?.map(u => ({ id: u.id, name: u.name, createdAt: u.created_at ? new Date(u.created_at) : new Date(), email: u.email })) || [];
      const mappedFixedExp = fixedExp?.map(f => ({ id: f.id, name: f.name, category: f.category, amount: f.amount, dueDay: f.due_day, isPaid: f.is_paid, paidBy: f.paid_by, paidAt: f.paid_at ? new Date(f.paid_at) : undefined, createdAt: new Date(f.created_at), effectiveFrom: parseSupabaseDate(f.effective_from), effectiveUntil: f.effective_until ? parseSupabaseDate(f.effective_until) : undefined, creditCardId: f.credit_card_id })) || [];
      const mappedFixedInc = fixedInc?.map(f => ({ id: f.id, description: f.description, amount: f.amount, receiveDay: f.receive_day, isReceived: f.is_received, receivedBy: f.received_by, receivedAt: f.received_at ? new Date(f.received_at) : undefined, createdAt: new Date(f.created_at), effectiveFrom: parseSupabaseDate(f.effective_from), effectiveUntil: f.effective_until ? parseSupabaseDate(f.effective_until) : undefined })) || [];
      const mappedExpenses = expenses?.map(e => ({ id: e.id, description: e.description, amount: e.amount, type: e.type, category: e.category, paymentMethod: e.payment_method, date: parseSupabaseDate(e.date), userId: e.user_id, installments: { current: e.installments_current, total: e.installments_total }, createdAt: new Date(e.created_at) })) || [];
      const mappedMovements = movements?.map(m => ({ id: m.id, type: m.type, description: m.description, amount: m.amount, userId: m.user_id, date: parseSupabaseDate(m.date), createdAt: new Date(m.created_at) })) || [];
      const mappedCards = cards?.map(c => ({ id: c.id, name: c.name, limit: c.limit, closingDay: c.closing_day, dueDay: c.due_day, isPaid: c.is_paid, paidBy: c.paid_by, paidAt: c.paid_at ? new Date(c.paid_at) : undefined, createdAt: new Date(c.created_at) })) || [];
      const mappedInvestments = investments?.map(i => ({ id: i.id, description: i.description, amount: i.amount, date: parseSupabaseDate(i.date), userId: i.user_id, createdAt: new Date(i.created_at) })) || [];
      
      const mappedPayments = fixedPayments?.map(p => ({ 
        id: p.id, fixedExpenseId: p.fixed_expense_id, month: p.month, year: p.year, amount: Number(p.amount), paidAt: new Date(p.paid_at),
        generatedExpenseId: p.generated_expense_id // <--- Mapeia o ID gerado
      })) || [];
      
      const mappedReceipts = fixedReceipts?.map(r => ({
        id: r.id, fixedIncomeId: r.fixed_income_id, month: r.month, year: r.year, amount: Number(r.amount), receivedAt: new Date(r.received_at)
      })) || [];

      dispatch({
        type: 'SET_DATA',
        payload: {
          users: mappedUsers,
          settings: settings ? { monthlyYield: settings.monthly_yield, initialBalance: settings.initial_balance, initialInvestment: settings.initial_investment } : initialState.settings,
          expenses: mappedExpenses, fixedExpenses: mappedFixedExp, fixedIncomes: mappedFixedInc,
          cashMovements: mappedMovements, creditCards: mappedCards, investments: mappedInvestments, 
          fixedPayments: mappedPayments, fixedReceipts: mappedReceipts, isLoading: false
        }
      });
    } catch (error) {
      console.error(error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  useEffect(() => { refreshData(); }, []);

  // ... (ACTIONS PADRÃO IGUAIS AO ANTERIOR) ...
  const addUser = async (userData: any) => { const { data, error } = await supabase.from('app_users').insert(userData).select().single(); if(error) throw error; dispatch({ type: 'ADD_ITEM', payload: { key: 'users', item: data } }); };
  const addCashMovement = async (movement: any) => { if (!userId) return; const { data, error } = await supabase.from('cash_movements').insert({ type: movement.type, description: movement.description, amount: movement.amount, user_id: movement.userId || userId, date: movement.date }).select().single(); if (error) throw error; const newMovement = { ...data, date: parseSupabaseDate(data.date), userId: data.user_id, createdAt: new Date(data.created_at) }; dispatch({ type: 'ADD_ITEM', payload: { key: 'cashMovements', item: newMovement } }); };
  const addFixedExpense = async (expense: any) => { const dbPayload = { name: expense.name, category: expense.category, amount: expense.amount, due_day: expense.dueDay, is_paid: false, effective_from: expense.effectiveFrom, credit_card_id: expense.creditCardId || null }; const { data, error } = await supabase.from('fixed_expenses').insert(dbPayload).select().single(); if (error) throw error; const newItem: FixedExpense = { id: data.id, name: data.name, category: data.category, amount: data.amount, dueDay: data.due_day, isPaid: false, createdAt: new Date(data.created_at), effectiveFrom: parseSupabaseDate(data.effective_from), creditCardId: data.credit_card_id }; dispatch({ type: 'ADD_ITEM', payload: { key: 'fixedExpenses', item: newItem } }); };
  const updateFixedExpense = async (id: string, updates: any) => { const dbUpdates: any = {}; if (updates.paidBy !== undefined) dbUpdates.paid_by = updates.paidBy; if (updates.paidAt !== undefined) dbUpdates.paid_at = updates.paidAt; const { error } = await supabase.from('fixed_expenses').update(dbUpdates).eq('id', id); if (error) throw error; dispatch({ type: 'UPDATE_ITEM', payload: { key: 'fixedExpenses', id, updates } }); };
  
  // --- FUNÇÃO CORAÇÃO DO SISTEMA (ATUALIZADA) ---
  const toggleFixedExpensePayment = async (expenseId: string, month: number, year: number, amount: number) => {
    // 1. Verifica se já está pago (para Estornar)
    const existingPayment = state.fixedPayments.find(p => p.fixedExpenseId === expenseId && p.month === month && p.year === year);
    
    if (existingPayment) {
      // === ESTORNO ===
      
      // Se criou uma despesa automática no cartão, vamos apagá-la
      if (existingPayment.generatedExpenseId) {
          await supabase.from('expenses').delete().eq('id', existingPayment.generatedExpenseId);
          dispatch({ type: 'REMOVE_ITEM', payload: { key: 'expenses', id: existingPayment.generatedExpenseId } });
      }

      // Remove o registro de pagamento
      const { error } = await supabase.from('fixed_expense_payments').delete().eq('id', existingPayment.id);
      if (error) throw error;
      
      const updatedPayments = state.fixedPayments.filter(p => p.id !== existingPayment.id);
      dispatch({ type: 'SET_DATA', payload: { fixedPayments: updatedPayments } });
      toast({ title: "Pagamento estornado!" });
      
    } else {
      // === PAGAMENTO ===
      const fixedExpense = state.fixedExpenses.find(e => e.id === expenseId);
      if (!fixedExpense) return;

      let generatedExpenseId = null;

      // Se tem cartão vinculado, CRIA O REGISTRO NA TABELA DE DESPESAS
      if (fixedExpense.creditCardId) {
         const creditCard = state.creditCards.find(c => c.id === fixedExpense.creditCardId);
         if (creditCard && userId) {
            // Data do gasto = data de vencimento daquele mês
            const dateOfExpense = new Date(year, month, fixedExpense.dueDay);
            
            const expensePayload = {
               user_id: userId, // Pega o usuário logado
               description: `${fixedExpense.name} (Fixo)`,
               amount: amount,
               type: 'cartao_credito',
               category: fixedExpense.category,
               payment_method: creditCard.name, // Nome do cartão
               date: dateOfExpense,
               installments_current: 1,
               installments_total: 1
            };

            const { data: expenseData, error: expenseError } = await supabase.from('expenses').insert(expensePayload).select().single();
            if (!expenseError && expenseData) {
               generatedExpenseId = expenseData.id;
               
               // Atualiza estado local de despesas para refletir na hora
               const newExpense = { ...expenseData, date: parseSupabaseDate(expenseData.date), userId: expenseData.user_id, paymentMethod: expenseData.payment_method, createdAt: new Date(expenseData.created_at) };
               dispatch({ type: 'ADD_ITEM', payload: { key: 'expenses', item: newExpense } });
            }
         }
      }

      // Cria o registro de pagamento (salvando o ID da despesa gerada, se houver)
      const { data, error } = await supabase.from('fixed_expense_payments').insert({ 
          fixed_expense_id: expenseId, 
          month: month, 
          year: year, 
          amount: amount,
          generated_expense_id: generatedExpenseId
      }).select().single();

      if (error) throw error;
      
      const newPayment: FixedPayment = { 
          id: data.id, 
          fixedExpenseId: data.fixed_expense_id, 
          month: data.month, 
          year: data.year, 
          amount: Number(data.amount), 
          paidAt: new Date(data.paid_at),
          generatedExpenseId: data.generated_expense_id
      };
      
      dispatch({ type: 'SET_DATA', payload: { fixedPayments: [...state.fixedPayments, newPayment] } });
      toast({ title: "Conta paga!", description: generatedExpenseId ? "Lançado na fatura do cartão." : "Pagamento registrado." });
    }
  };

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
    // ... (Mantém sua lógica original de addExpense aqui, é grande mas é a mesma de antes)
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
          expensesToInsert.push({ user_id: formUserId || userId, description: `${description} (${i + 1}/${currentInstallments})`, amount: installmentValue, type: type, category: category, payment_method: paymentMethod, date: installmentDate, installments_current: i + 1, installments_total: currentInstallments });
        }
        const { error } = await supabase.from('expenses').insert(expensesToInsert);
        if (error) throw error;
        refreshData(); 
        toast({ title: "Compra parcelada registrada!" });
      } else {
        const dbPayload = { description, amount, type, category, payment_method: paymentMethod, date, user_id: formUserId || userId, installments_current: 1, installments_total: 1 };
        const { data, error } = await supabase.from('expenses').insert(dbPayload).select().single();
        if (error) throw error;
        const newExpense = { ...data, date: parseSupabaseDate(data.date), userId: data.user_id, paymentMethod: data.payment_method, createdAt: new Date(data.created_at) };
        dispatch({ type: 'ADD_ITEM', payload: { key: 'expenses', item: newExpense } });
        toast({ title: "Despesa salva!" });
      }
    } catch (error: any) { console.error(error); toast({ title: "Erro", description: error.message, variant: "destructive" }); }
  };

  // ... (RESTO DAS ACTIONS IGUAIS: toggleFixedIncomeReceipt, etc...)
  const toggleFixedIncomeReceipt = async (incomeId: string, month: number, year: number, amount: number) => {
    const existingReceipt = state.fixedReceipts.find(r => r.fixedIncomeId === incomeId && r.month === month && r.year === year);
    if (existingReceipt) {
      const { error } = await supabase.from('fixed_income_receipts').delete().eq('id', existingReceipt.id);
      if (error) throw error;
      const updatedReceipts = state.fixedReceipts.filter(r => r.id !== existingReceipt.id);
      dispatch({ type: 'SET_DATA', payload: { fixedReceipts: updatedReceipts } });
      toast({ title: "Recebimento estornado!" });
    } else {
      const { data, error } = await supabase.from('fixed_income_receipts').insert({ fixed_income_id: incomeId, month: month, year: year, amount: amount }).select().single();
      if (error) throw error;
      const newReceipt: FixedReceipt = { id: data.id, fixedIncomeId: data.fixed_income_id, month: data.month, year: data.year, amount: Number(data.amount), receivedAt: new Date(data.received_at) };
      dispatch({ type: 'SET_DATA', payload: { fixedReceipts: [...state.fixedReceipts, newReceipt] } });
      toast({ title: "Valor recebido com sucesso!" });
    }
  };
  
  const addFixedIncome = async (income: any) => { const dbPayload = { description: income.description, amount: income.amount, receive_day: income.receiveDay, is_received: false, effective_from: income.effectiveFrom }; const { data, error } = await supabase.from('fixed_incomes').insert(dbPayload).select().single(); if (error) throw error; const newItem: FixedIncome = { id: data.id, description: data.description, amount: data.amount, receiveDay: data.receive_day, isReceived: false, createdAt: new Date(data.created_at), effectiveFrom: parseSupabaseDate(data.effective_from) }; dispatch({ type: 'ADD_ITEM', payload: { key: 'fixedIncomes', item: newItem } }); toast({ title: "Entrada fixa salva!" }); };
  const updateFixedIncome = async (id: string, updates: any) => { const dbUpdates: any = {}; if (updates.isReceived !== undefined) dbUpdates.is_received = updates.isReceived; if (updates.receivedBy !== undefined) dbUpdates.received_by = updates.receivedBy; if (updates.receivedAt !== undefined) dbUpdates.received_at = updates.receivedAt; const { error } = await supabase.from('fixed_incomes').update(dbUpdates).eq('id', id); if (error) throw error; dispatch({ type: 'UPDATE_ITEM', payload: { key: 'fixedIncomes', id, updates } }); };
  const addCreditCard = async (card: any) => { const dbPayload = { name: card.name, limit: card.limit, closing_day: card.closingDay, due_day: card.dueDay, is_paid: card.isPaid }; const { data, error } = await supabase.from('credit_cards').insert(dbPayload).select().single(); if(error) throw error; const newCard = { id: data.id, name: data.name, limit: data.limit, closingDay: data.closing_day, dueDay: data.due_day, isPaid: data.is_paid, createdAt: new Date(data.created_at) }; dispatch({ type: 'ADD_ITEM', payload: { key: 'creditCards', item: newCard } }); };
  const updateCreditCard = async (id: string, updates: any) => { const dbUpdates: any = {}; if (updates.isPaid !== undefined) dbUpdates.is_paid = updates.isPaid; if (updates.paidBy !== undefined) dbUpdates.paid_by = updates.paidBy; if (updates.paidAt !== undefined) dbUpdates.paid_at = updates.paidAt; const { error } = await supabase.from('credit_cards').update(dbUpdates).eq('id', id); if (error) throw error; dispatch({ type: 'UPDATE_ITEM', payload: { key: 'creditCards', id, updates } }); };
  const addInvestment = async (investment: any) => { if (!userId) return; const { data, error } = await supabase.from('investments').insert({ description: investment.description, amount: investment.amount, date: investment.date, user_id: investment.userId || userId }).select().single(); if(error) throw error; const newInvestment = { id: data.id, description: data.description, amount: data.amount, date: parseSupabaseDate(data.date), userId: data.user_id, createdAt: new Date(data.created_at) }; dispatch({ type: 'ADD_ITEM', payload: { key: 'investments', item: newInvestment } }); };
  const updateSettings = async (settings: any) => { const dbPayload: any = {}; if(settings.monthlyYield !== undefined) dbPayload.monthly_yield = settings.monthlyYield; if(settings.initialInvestment !== undefined) dbPayload.initial_investment = settings.initialInvestment; if(settings.initialBalance !== undefined) dbPayload.initial_balance = settings.initialBalance; const { data: currentSettings } = await supabase.from('financial_settings').select('id').single(); if(currentSettings) { await supabase.from('financial_settings').update(dbPayload).eq('id', currentSettings.id); } else { await supabase.from('financial_settings').insert(dbPayload); } dispatch({ type: 'UPDATE_SETTINGS', payload: settings }); };

  // --- GETTERS (CÁLCULOS ATUALIZADOS) ---
  const getTotalInvestments = () => state.settings.initialInvestment + state.investments.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const getInvestmentYield = () => getTotalInvestments() * (state.settings.monthlyYield / 100);
  
  const getActiveFixedExpenses = (month: number, year: number) => {
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const startOfMonth = new Date(year, month, 1, 0, 0, 0);
    const activeExpenses = state.fixedExpenses.filter(expense => {
      const effectiveFrom = new Date(expense.effectiveFrom);
      const effectiveUntil = expense.effectiveUntil ? new Date(expense.effectiveUntil) : null;
      return effectiveFrom <= endOfMonth && (!effectiveUntil || effectiveUntil >= startOfMonth);
    });
    return activeExpenses.map(expense => {
      const payment = state.fixedPayments.find(p => p.fixedExpenseId === expense.id && p.month === month && p.year === year);
      return { ...expense, isPaid: !!payment, paidAt: payment?.paidAt };
    });
  };

  const getActiveFixedIncomes = (month: number, year: number) => {
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
    const startOfMonth = new Date(year, month, 1, 0, 0, 0);
    const activeIncomes = state.fixedIncomes.filter(income => {
      const effectiveFrom = new Date(income.effectiveFrom);
      const effectiveUntil = income.effectiveUntil ? new Date(income.effectiveUntil) : null;
      return effectiveFrom <= endOfMonth && (!effectiveUntil || effectiveUntil >= startOfMonth);
    });
    return activeIncomes.map(income => {
      const receipt = state.fixedReceipts.find(r => r.fixedIncomeId === income.id && r.month === month && r.year === year);
      return { ...income, isReceived: !!receipt, receivedAt: receipt?.receivedAt };
    });
  };

  const getCurrentBalance = (): number => {
    const cashIncome = state.cashMovements.filter(m => m.type === 'income').reduce((acc, m) => acc + Number(m.amount), 0);
    const fixedIncomeReceived = state.fixedReceipts.reduce((acc, r) => acc + Number(r.amount), 0);
    const cashOutcome = state.cashMovements.filter(m => m.type === 'outcome').reduce((acc, m) => acc + Number(m.amount), 0);
    const immediateExpenses = state.expenses.filter(e => e.paymentMethod === 'debito' || e.paymentMethod === 'pix' || e.paymentMethod === 'dinheiro').reduce((sum, e) => sum + Number(e.amount), 0);
    
    // Soma apenas pagamentos de contas fixas SEM cartão (pois com cartão vai pra fatura)
    const fixedExpensesPaidCash = state.fixedPayments.reduce((sum, payment) => {
      const expense = state.fixedExpenses.find(e => e.id === payment.fixedExpenseId);
      if (expense && expense.creditCardId) return sum; 
      return sum + Number(payment.amount);
    }, 0);
    
    return Number(state.settings.initialBalance) + cashIncome + fixedIncomeReceived - cashOutcome - immediateExpenses - fixedExpensesPaidCash;
  };

  const getDashboardData = (): DashboardData => {
    const { month: currentMonth, year: currentYear } = state.selectedMonth;
    
    // 1. Pega todas as despesas lançadas na tabela 'expenses' neste mês
    const expensesOfMonth = state.expenses.filter(e => { 
        const d = new Date(e.date); 
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear; 
    });

    // --- CORREÇÃO DE DUPLICIDADE AQUI ---
    // A. Descobre quais IDs de despesas foram gerados automaticamente por contas fixas
    const generatedIds = state.fixedPayments
      .map(p => p.generatedExpenseId)
      .filter((id): id is string => id !== null && id !== undefined);

    // B. Calcula Variáveis: Ignora as despesas que estão na lista de gerados
    const variableExpenses = expensesOfMonth
      .filter(e => !generatedIds.includes(e.id)) // <--- PULO DO GATO
      .reduce((sum, e) => sum + Number(e.amount), 0);

    // -------------------------------------

    const cashIncome = state.cashMovements
      .filter(m => {
        const d = new Date(m.date);
        return m.type === 'income' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const activeFixedExpenses = getActiveFixedExpenses(currentMonth, currentYear);
    const activeFixedIncomes = getActiveFixedIncomes(currentMonth, currentYear);

    const totalFixedExpensesValue = activeFixedExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalFixedIncomesValue = activeFixedIncomes.reduce((sum, i) => sum + Number(i.amount), 0);

    // CÁLCULO DA FATURA
    // Aqui nós usamos 'expensesOfMonth' COMPLETO (sem filtrar), 
    // porque na fatura do cartão tem que aparecer TUDO (Variável + Fixo vinculado).
    const pendingCreditCardList = state.creditCards
      .filter(c => !c.isPaid)
      .map(card => {
        const billAmount = expensesOfMonth
          .filter(e => e.paymentMethod === card.name)
          .reduce((sum, e) => sum + Number(e.amount), 0);
        return { ...card, billAmount };
      });

    const pendingFixedList = activeFixedExpenses.filter(e => !e.isPaid);
    
    // Pendências financeiras
    const pendingFixedToPay = pendingFixedList
      .filter(e => !e.creditCardId) // Só conta como saída de caixa se NÃO for de cartão
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const pendingFixedToReceive = activeFixedIncomes.filter(i => !i.isReceived).reduce((sum, i) => sum + Number(i.amount), 0);
    const pendingCardsTotal = pendingCreditCardList.reduce((sum, c) => sum + c.billAmount, 0);

    const currentBalance = getCurrentBalance();
    const totalInvestments = getTotalInvestments();
    const investmentYield = getInvestmentYield();
    const totalIncome = totalFixedIncomesValue + cashIncome;
    
    const projectedBalance = currentBalance + pendingFixedToReceive - pendingFixedToPay - pendingCardsTotal + investmentYield;

    // Top Users (Também filtramos os gerados para não poluir o ranking com contas fixas)
    const userStats = state.users.map(u => ({ 
      userId: u.id, 
      userName: u.name, 
      totalAmount: expensesOfMonth
        .filter(e => e.userId === u.id && !generatedIds.includes(e.id)) // <--- Filtro aqui também
        .reduce((acc, e) => acc + Number(e.amount), 0), 
      type: 'outcome' as 'income' | 'outcome' 
    })).sort((a, b) => b.totalAmount - a.totalAmount);

    return { 
      totalIncome,
      totalFixedExpenses: totalFixedExpensesValue,
      variableExpenses, // Agora contém APENAS os gastos avulsos reais
      totalInvestments,
      projectedBalance,
      currentBalance,
      
      pendingIncomeValue: pendingFixedToReceive,       
      pendingFixedExpensesValue: pendingFixedToPay,

      pendingFixedExpenses: pendingFixedList.length,
      pendingFixedList,
      pendingCreditCards: pendingCreditCardList.length,
      pendingCreditCardList,
      investmentYield, 
      topUsers: userStats 
    };
  };

  const getMonthlyData = (month: number, year: number): MonthlyData => {
    const fixedExpenses = getActiveFixedExpenses(month, year);
    const variableExpenses = state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === month && d.getFullYear() === year && e.type === 'variavel'; });
    const creditCardExpenses = state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === month && d.getFullYear() === year && e.type === 'cartao_credito'; });
    const cashMovements = state.cashMovements.filter(m => { const d = new Date(m.date); return d.getMonth() === month && d.getFullYear() === year; });
    const investments = state.investments.filter(i => { const d = new Date(i.date); return d.getMonth() === month && d.getFullYear() === year; });
    return { month, year, fixedExpenses, variableExpenses, creditCardExpenses, cashMovements, investments };
  };

  const getUserName = (userId: string) => { const user = state.users.find(u => u.id === userId); return user ? user.name : '---'; };

  const value = {
    state, dispatch, refreshData, addUser, addExpense, addCashMovement, addFixedExpense, updateFixedExpense, toggleFixedExpensePayment,
    addFixedIncome, updateFixedIncome, toggleFixedIncomeReceipt,
    addCreditCard, updateCreditCard, updateSettings, addInvestment,
    getDashboardData, getMonthlyData, getActiveFixedExpenses, getActiveFixedIncomes, getCurrentBalance, getTotalInvestments, getInvestmentYield, getUserName
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};