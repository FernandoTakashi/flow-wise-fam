import {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import {
  addMonthsISO, dayOfMonthISO, invoiceDates, isInMonth, isoParts, recurrenceDueISO, resolveInvoiceRef, spDateISO, todayISO,
} from '@/lib/dates';
import { splitInstallments } from '@/lib/money';
import type {
  Account, AccountKind, CardInvoice, Category, CategoryKind, InvoiceStatus, Investment, MemberBalance,
  MonthlyFilter, PeriodLock, Profile, Recurrence, Settlement, Transaction, TxKind, TxStatus, UUID,
  Wallet, WalletMember, WalletSettings,
} from '@/types';

const WALLET_KEY = 'financeapp.walletId';

// ---------------------------------------------------------------------------
// Mappers (linha do PostgREST → domínio). Sem tipos gerados ainda: `supabase
// gen types typescript` na Fase 4 substitui o `any` por Database['public'].
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
const mapProfile = (r: any): Profile => ({ id: r.id, name: r.name ?? '', email: r.email });
const mapWallet = (r: any): Wallet => ({ id: r.id, name: r.name, baseCurrency: r.base_currency, createdBy: r.created_by });
const mapMember = (r: any): WalletMember => ({
  walletId: r.wallet_id, userId: r.user_id, role: r.role,
  profile: r.profiles ? mapProfile(r.profiles) : undefined,
});
const mapAccount = (r: any): Account => ({
  id: r.id, walletId: r.wallet_id, name: r.name, kind: r.kind,
  openingBalanceCents: Number(r.opening_balance_cents ?? 0),
  closingDay: r.closing_day, dueDay: r.due_day,
  creditLimitCents: r.credit_limit_cents == null ? null : Number(r.credit_limit_cents),
  archived: !!r.archived,
});
const mapCategory = (r: any): Category => ({
  id: r.id, walletId: r.wallet_id, name: r.name, kind: r.kind, icon: r.icon, color: r.color, archived: !!r.archived,
});
const mapRecurrence = (r: any): Recurrence => ({
  id: r.id, walletId: r.wallet_id, description: r.description, kind: r.kind,
  amountCents: Number(r.amount_cents), categoryId: r.category_id, accountId: r.account_id,
  day: r.day, frequency: r.frequency, startDate: r.start_date, endDate: r.end_date, active: !!r.active,
  autopay: !!r.autopay, variableAmount: !!r.variable_amount, shared: !!r.shared,
});
const mapInvoice = (r: any): CardInvoice => ({
  id: r.id, walletId: r.wallet_id, accountId: r.account_id, refMonth: r.ref_month, refYear: r.ref_year,
  closingDate: r.closing_date, dueDate: r.due_date, status: r.status, paidTransactionId: r.paid_transaction_id,
});
const mapTransaction = (r: any): Transaction => ({
  id: r.id, walletId: r.wallet_id, accountId: r.account_id, kind: r.kind,
  amountCents: Number(r.amount_cents), date: r.date, refMonth: r.ref_month, refYear: r.ref_year,
  status: r.status, description: r.description ?? '',
  categoryId: r.category_id, memberId: r.member_id, cardInvoiceId: r.card_invoice_id, recurrenceId: r.recurrence_id,
  installmentGroup: r.installment_group, installmentNo: r.installment_no, installmentOf: r.installment_of,
  transferPeerId: r.transfer_peer_id, note: r.note, createdBy: r.created_by, source: r.source ?? 'app',
  splits: (r.transaction_splits ?? []).map((s: any) => ({
    id: s.id, transactionId: s.transaction_id, memberId: s.member_id, shareCents: Number(s.share_cents),
  })),
});
const mapInvestment = (r: any): Investment => ({
  id: r.id, walletId: r.wallet_id, memberId: r.member_id, description: r.description,
  amountCents: Number(r.amount_cents), yieldRateBps: Number(r.yield_rate_bps ?? 0), date: r.date,
});
const mapSettings = (r: any): WalletSettings => ({
  walletId: r.wallet_id, initialInvestmentCents: Number(r.initial_investment_cents ?? 0),
  defaultYieldBps: Number(r.default_yield_bps ?? 0),
});
const mapLock = (r: any): PeriodLock => ({
  walletId: r.wallet_id, refMonth: r.ref_month, refYear: r.ref_year, lockedBy: r.locked_by, lockedAt: r.locked_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
export interface NewAccount {
  name: string; kind: AccountKind; openingBalanceCents?: number;
  closingDay?: number | null; dueDay?: number | null; creditLimitCents?: number | null;
}
export interface NewTransaction {
  accountId: UUID;
  kind: Extract<TxKind, 'income' | 'expense'>;
  amountCents: number;
  dateISO: string;
  description?: string;
  categoryId?: UUID | null;
  memberId?: UUID | null;
  status?: TxStatus;
  installments?: number;
  /** parcela em que a compra está agora (1 = compra nova). Só cria da parcela `installmentStart` até `installments`. */
  installmentStart?: number;
  note?: string | null;
  /** competência manual (só para não-cartão). Omitido = derivado da data. */
  refMonth?: number;
  refYear?: number;
  splits?: { memberId: UUID; shareCents: number }[];
}
export interface NewRecurrence {
  description: string; kind: CategoryKind; amountCents: number;
  categoryId?: UUID | null; accountId?: UUID | null; day: number;
  startDate: string; endDate?: string | null; autopay?: boolean; variableAmount?: boolean; shared?: boolean;
}
export interface NewInvestment {
  description: string; amountCents: number; yieldRateBps: number; dateISO: string; memberId?: UUID | null;
}

export interface OccurrenceView {
  recurrence: Recurrence;
  dueDateISO: string;
  txId: UUID | null;
  status: 'none' | 'pending' | 'paid';
  amountCents: number;
  estimatedCents: number;
  onCard: boolean;
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

interface FinanceApi {
  loading: boolean;
  userId: UUID | null;
  profile: Profile | null;
  today: string;
  wallets: Wallet[];
  walletId: UUID | null;
  wallet: Wallet | null;
  role: 'owner' | 'member' | null;
  members: WalletMember[];
  accounts: Account[];
  categories: Category[];
  recurrences: Recurrence[];
  invoices: CardInvoice[];
  transactions: Transaction[];
  investments: Investment[];
  settings: WalletSettings | null;
  periodLocks: PeriodLock[];
  selectedMonth: MonthlyFilter;

  setWallet(id: UUID): void;
  setSelectedMonth(f: MonthlyFilter): void;
  reload(): Promise<void>;

  cards: Account[];
  spendingAccounts: Account[];
  activeCategories: Category[];
  categoryName(id?: UUID | null): string;
  memberName(id?: UUID | null): string;
  accountName(id?: UUID | null): string;
  accountBalanceCents(accountId: UUID, uptoISO?: string): number;
  cashBalanceCents(uptoISO?: string): number;
  cardCommittedCents(cardId: UUID): number;
  cardAvailableCents(cardId: UUID): number;
  invoiceView(cardId: UUID, month: number, year: number): InvoiceView;
  monthTransactionsByDate(month: number, year: number): Transaction[];
  monthTransactionsByRef(month: number, year: number): Transaction[];
  monthSummary(month: number, year: number): MonthSummary;
  recurrenceOccurrences(month: number, year: number): OccurrenceView[];
  spendByMember(month: number, year: number): MemberSpend[];
  isPeriodLocked(month: number, year: number): boolean;
  wouldOverdraw(accountId: UUID, amountCents: number): boolean;
  wouldExceedLimit(cardId: UUID, amountCents: number): boolean;
  totalInvestedCents(): number;
  investmentMonthlyYieldCents(): number;
  memberBalances(): MemberBalance[];
  settlements(): Settlement[];

  updateProfile(patch: { name: string }): Promise<void>;
  createWallet(name: string): Promise<UUID>;
  renameWallet(id: UUID, name: string): Promise<void>;
  deleteWallet(id: UUID): Promise<void>;
  addMemberByEmail(email: string): Promise<void>;
  removeMember(userId: UUID): Promise<void>;

  addAccount(a: NewAccount): Promise<void>;
  updateAccount(id: UUID, patch: Partial<NewAccount> & { archived?: boolean }): Promise<void>;
  deleteAccount(id: UUID): Promise<void>;

  addCategory(c: { name: string; kind: CategoryKind; icon?: string; color?: string }): Promise<void>;
  updateCategory(id: UUID, patch: Partial<{ name: string; icon: string; color: string; archived: boolean }>): Promise<void>;
  deleteCategory(id: UUID): Promise<void>;

  addTransaction(input: NewTransaction): Promise<void>;
  updateTransaction(id: UUID, patch: Partial<NewTransaction>): Promise<void>;
  deleteTransaction(id: UUID): Promise<void>;
  setTransactionStatus(id: UUID, status: TxStatus): Promise<void>;
  payCardInvoice(cardId: UUID, month: number, year: number, fromAccountId: UUID, dateISO: string, memberId: UUID | null): Promise<void>;
  unpayCardInvoice(invoiceId: UUID): Promise<void>;
  setInvoiceStatus(invoiceId: UUID, status: Extract<InvoiceStatus, 'open' | 'closed'>): Promise<void>;

  addRecurrence(r: NewRecurrence): Promise<void>;
  updateRecurrence(id: UUID, patch: Partial<NewRecurrence> & { active?: boolean }): Promise<void>;
  deleteRecurrence(id: UUID): Promise<void>;
  /** `paidOnISO` = dia da baixa (default hoje); num fixo de cartão decide a fatura. `shared` (default = flag da recorrência) divide igual entre os membros. `accountId` = conta de débito escolhida no ato (só p/ fixo não-cartão). */
  markRecurrenceOccurrence(recurrenceId: UUID, month: number, year: number, amountCents: number, memberId: UUID | null, paidOnISO?: string, shared?: boolean, accountId?: UUID): Promise<void>;
  /** Registra o valor real do mês sem marcar como pago (transação `pending`). Não mexe no saldo, mas entra na projeção. */
  setRecurrenceOccurrenceAmount(recurrenceId: UUID, month: number, year: number, amountCents: number): Promise<void>;
  unmarkRecurrenceOccurrence(recurrenceId: UUID, month: number, year: number): Promise<void>;

  addInvestment(i: NewInvestment): Promise<void>;
  updateInvestment(id: UUID, patch: Partial<NewInvestment>): Promise<void>;
  deleteInvestment(id: UUID): Promise<void>;

  updateSettings(patch: Partial<{ initialInvestmentCents: number; defaultYieldBps: number }>): Promise<void>;

  lockPeriod(month: number, year: number): Promise<void>;
  unlockPeriod(month: number, year: number): Promise<void>;
}

const FinanceContext = createContext<FinanceApi | undefined>(undefined);

export const useFinance = (): FinanceApi => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance deve ser usado dentro de FinanceProvider');
  return ctx;
};

// ---------------------------------------------------------------------------
export const FinanceProvider = ({ children }: { children: ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<UUID | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [today, setToday] = useState<string>(todayISO());
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState<UUID | null>(() => {
    try { return localStorage.getItem(WALLET_KEY); } catch { return null; }
  });
  const [members, setMembers] = useState<WalletMember[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [invoices, setInvoices] = useState<CardInvoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [settings, setSettings] = useState<WalletSettings | null>(null);
  const [periodLocks, setPeriodLocks] = useState<PeriodLock[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<MonthlyFilter>(() => {
    const d = new Date();
    return { month: d.getMonth(), year: d.getFullYear() };
  });

  const walletIdRef = useRef<UUID | null>(walletId);
  walletIdRef.current = walletId;
  const skewRef = useRef(0);
  skewRef.current = skewMs;

  const serverNow = useCallback(() => new Date(Date.now() + skewRef.current), []);
  const computeToday = useCallback(() => setToday(spDateISO(new Date(Date.now() + skewRef.current))), []);

  const persistWallet = (id: UUID | null) => {
    try { if (id) localStorage.setItem(WALLET_KEY, id); } catch { /* ignore */ }
  };

  // --- carregamento ----------------------------------------------------
  const loadWallets = useCallback(async (uid: UUID): Promise<UUID | null> => {
    const { data, error } = await supabase
      .from('wallet_members')
      .select('wallet_id, role, wallets(id, name, base_currency, created_by)')
      .eq('user_id', uid);
    if (error) throw error;
    const list = (data ?? [])
      .map((r) => {
        const w = (r as { wallets?: unknown }).wallets;
        return w ? mapWallet(w) : null;
      })
      .filter((w): w is Wallet => w !== null);
    setWallets(list);
    const chosen = list.find((w) => w.id === walletIdRef.current)?.id ?? list[0]?.id ?? null;
    setWalletId(chosen);
    persistWallet(chosen);
    return chosen;
  }, []);

  const loadWalletData = useCallback(async (wid: UUID) => {
    const [
      membersRes, accountsRes, categoriesRes, recurrencesRes,
      invoicesRes, txRes, investmentsRes, settingsRes, locksRes,
    ] = await Promise.all([
      supabase.from('wallet_members').select('wallet_id, user_id, role, profiles(id, name, email)').eq('wallet_id', wid),
      supabase.from('accounts').select('*').eq('wallet_id', wid).order('created_at'),
      supabase.from('categories').select('*').eq('wallet_id', wid).order('name'),
      supabase.from('recurrences').select('*').eq('wallet_id', wid).order('day'),
      supabase.from('card_invoices').select('*').eq('wallet_id', wid),
      supabase.from('transactions').select('*, transaction_splits(*)').eq('wallet_id', wid).order('date', { ascending: false }),
      supabase.from('investments').select('*').eq('wallet_id', wid).order('date', { ascending: false }),
      supabase.from('wallet_settings').select('*').eq('wallet_id', wid).maybeSingle(),
      supabase.from('period_locks').select('*').eq('wallet_id', wid),
    ]);

    for (const res of [membersRes, accountsRes, categoriesRes, recurrencesRes, invoicesRes, txRes, investmentsRes]) {
      if (res.error) throw res.error;
    }
    if (locksRes.error) console.warn('[finance] period_locks indisponível (rode a migration 2):', locksRes.error.message);

    setMembers((membersRes.data ?? []).map(mapMember));
    setAccounts((accountsRes.data ?? []).map(mapAccount));
    setCategories((categoriesRes.data ?? []).map(mapCategory));
    setRecurrences((recurrencesRes.data ?? []).map(mapRecurrence));
    setInvoices((invoicesRes.data ?? []).map(mapInvoice));
    setTransactions((txRes.data ?? []).map(mapTransaction));
    setInvestments((investmentsRes.data ?? []).map(mapInvestment));
    setPeriodLocks((locksRes.data ?? []).map(mapLock));

    let s = settingsRes.data;
    if (!s) {
      const ins = await supabase.from('wallet_settings').insert({ wallet_id: wid }).select().single();
      s = ins.data;
    }
    setSettings(s ? mapSettings(s) : { walletId: wid, initialInvestmentCents: 0, defaultYieldBps: 0 });
  }, []);

  const syncServerClock = useCallback(async () => {
    try {
      const t0 = Date.now();
      const { data } = await supabase.rpc('app_now');
      const t1 = Date.now();
      if (data) {
        const serverMs = new Date(data as string).getTime();
        skewRef.current = serverMs - (t0 + (t1 - t0) / 2);
        setSkewMs(skewRef.current);
      }
    } catch { /* mantém relógio local */ }
    setToday(spDateISO(new Date(Date.now() + skewRef.current)));
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      await syncServerClock();

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      setProfile(prof ? mapProfile(prof) : { id: user.id, name: user.email ?? '', email: user.email });

      const chosen = await loadWallets(user.id);
      if (chosen) await loadWalletData(chosen);
    } catch (err) {
      console.error('[finance] bootstrap', err);
    } finally {
      setLoading(false);
    }
  }, [syncServerClock, loadWallets, loadWalletData]);

  const reload = useCallback(async () => {
    if (!userId) return;
    computeToday();
    await loadWallets(userId);
    const wid = walletIdRef.current;
    if (wid) await loadWalletData(wid);
  }, [userId, computeToday, loadWallets, loadWalletData]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    const onFocus = () => computeToday();
    window.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(computeToday, 60_000);
    return () => {
      window.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [computeToday]);

  const setWallet = useCallback((id: UUID) => {
    setWalletId(id);
    persistWallet(id);
    setLoading(true);
    loadWalletData(id).finally(() => setLoading(false));
  }, [loadWalletData]);

  // --- helpers -------------------------------------------------------
  const requireWallet = (): UUID => {
    const wid = walletIdRef.current;
    if (!wid) throw new Error('Nenhuma carteira selecionada.');
    return wid;
  };

  /** Competência de uma transação: cartão → mês da fatura; senão → mês da data (ou o passado). */
  const refFor = (
    dateISO: string, account?: Account | null, explicit?: { refMonth?: number; refYear?: number },
  ): { refMonth: number; refYear: number } => {
    if (account?.kind === 'card') return resolveInvoiceRef(dateISO, account.closingDay ?? 1);
    if (explicit?.refMonth && explicit?.refYear) return { refMonth: explicit.refMonth, refYear: explicit.refYear };
    const { y, m } = isoParts(dateISO);
    return { refMonth: m + 1, refYear: y };
  };

  const ensureInvoice = useCallback(async (card: Account, dateISO: string): Promise<UUID> => {
    const wid = requireWallet();
    const closing = card.closingDay ?? 1;
    const due = card.dueDay ?? closing;
    const { refMonth, refYear } = resolveInvoiceRef(dateISO, closing);
    const existing = invoices.find(
      (i) => i.accountId === card.id && i.refMonth === refMonth && i.refYear === refYear,
    );
    if (existing) return existing.id;
    const { closingDate, dueDate } = invoiceDates(refMonth, refYear, closing, due);
    const { data, error } = await supabase
      .from('card_invoices')
      .insert({ wallet_id: wid, account_id: card.id, ref_month: refMonth, ref_year: refYear, closing_date: closingDate, due_date: dueDate, status: 'open' })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') {
        const { data: again } = await supabase
          .from('card_invoices').select('id')
          .eq('account_id', card.id).eq('ref_year', refYear).eq('ref_month', refMonth).single();
        if (again) return again.id;
      }
      throw error;
    }
    return data.id;
  }, [invoices]);

  // --- perfil / carteira / membros --------------------------------
  const updateProfile: FinanceApi['updateProfile'] = async ({ name }) => {
    if (!userId) return;
    const { error } = await supabase.from('profiles').update({ name }).eq('id', userId);
    if (error) throw error;
    setProfile((p) => (p ? { ...p, name } : p));
  };

  const createWallet: FinanceApi['createWallet'] = async (name) => {
    if (!userId) throw new Error('Sem sessão.');
    const { data: w, error } = await supabase.from('wallets').insert({ name, created_by: userId }).select().single();
    if (error) throw error;
    const { error: mErr } = await supabase.from('wallet_members').insert({ wallet_id: w.id, user_id: userId, role: 'owner' });
    if (mErr) throw mErr;
    await supabase.rpc('seed_wallet', { w: w.id });
    await loadWallets(userId);
    setWallet(w.id);
    return w.id;
  };

  const renameWallet: FinanceApi['renameWallet'] = async (id, name) => {
    const { error } = await supabase.from('wallets').update({ name }).eq('id', id);
    if (error) throw error;
    await loadWallets(userId!);
  };

  const deleteWallet: FinanceApi['deleteWallet'] = async (id) => {
    if (wallets.length <= 1) throw new Error('Você precisa manter ao menos uma carteira.');
    const { error } = await supabase.from('wallets').delete().eq('id', id);
    if (error) throw error;
    const next = await loadWallets(userId!);
    if (next) await loadWalletData(next);
  };

  const addMemberByEmail: FinanceApi['addMemberByEmail'] = async (email) => {
    const wid = requireWallet();
    const { data: uid, error } = await supabase.rpc('find_user_id_by_email', { p_email: email });
    if (error) {
      if (error.code === 'PGRST202' || /function .*find_user_id_by_email/i.test(error.message)) {
        throw new Error('Falta aplicar a migração 20260908000005 no Supabase.');
      }
      throw error;
    }
    if (!uid) throw new Error(`Nenhuma conta encontrada para "${email.trim()}". Confira o e-mail (Supabase → Authentication → Users) — precisa ser o mesmo do cadastro.`);
    const { error: mErr } = await supabase.from('wallet_members').insert({ wallet_id: wid, user_id: uid as string, role: 'member' });
    if (mErr) {
      if (mErr.code === '23505') throw new Error('Essa pessoa já é membro desta carteira.');
      throw mErr;
    }
    await reload();
  };

  const removeMember: FinanceApi['removeMember'] = async (uid) => {
    const wid = requireWallet();
    if (uid === userId) throw new Error('Use "sair da carteira" para remover a si mesmo.');
    const { error } = await supabase.from('wallet_members').delete().eq('wallet_id', wid).eq('user_id', uid);
    if (error) throw error;
    await reload();
  };

  // --- contas ----------------------------------------------------
  const addAccount: FinanceApi['addAccount'] = async (a) => {
    const wid = requireWallet();
    const { error } = await supabase.from('accounts').insert({
      wallet_id: wid, name: a.name, kind: a.kind,
      opening_balance_cents: a.openingBalanceCents ?? 0,
      closing_day: a.kind === 'card' ? a.closingDay ?? null : null,
      due_day: a.kind === 'card' ? a.dueDay ?? null : null,
      credit_limit_cents: a.kind === 'card' ? a.creditLimitCents ?? null : null,
    });
    if (error) throw error;
    await reload();
  };

  const updateAccount: FinanceApi['updateAccount'] = async (id, patch) => {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.openingBalanceCents !== undefined) row.opening_balance_cents = patch.openingBalanceCents;
    if (patch.closingDay !== undefined) row.closing_day = patch.closingDay;
    if (patch.dueDay !== undefined) row.due_day = patch.dueDay;
    if (patch.creditLimitCents !== undefined) row.credit_limit_cents = patch.creditLimitCents;
    if (patch.archived !== undefined) row.archived = patch.archived;
    const { error } = await supabase.from('accounts').update(row).eq('id', id);
    if (error) throw error;
    await reload();
  };

  const deleteAccount: FinanceApi['deleteAccount'] = async (id) => {
    const count = transactions.filter((t) => t.accountId === id).length;
    if (count > 0) throw new Error(`Essa conta tem ${count} lançamento(s). Arquive-a em vez de excluir.`);
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) throw error;
    await reload();
  };

  // --- categorias ---------------------------------------------
  const addCategory: FinanceApi['addCategory'] = async (c) => {
    const wid = requireWallet();
    const { error } = await supabase.from('categories').insert({
      wallet_id: wid, name: c.name, kind: c.kind, icon: c.icon ?? null, color: c.color ?? null,
    });
    if (error) throw error;
    await reload();
  };

  const updateCategory: FinanceApi['updateCategory'] = async (id, patch) => {
    const { error } = await supabase.from('categories').update(patch).eq('id', id);
    if (error) throw error;
    await reload();
  };

  const deleteCategory: FinanceApi['deleteCategory'] = async (id) => {
    const count = transactions.filter((t) => t.categoryId === id).length;
    if (count > 0) {
      const { error } = await supabase.from('categories').update({ archived: true }).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    }
    await reload();
  };

  // --- transações --------------------------------------------
  const addTransaction: FinanceApi['addTransaction'] = async (input) => {
    const wid = requireWallet();
    const account = accounts.find((a) => a.id === input.accountId);
    if (!account) throw new Error('Conta inválida.');

    const isCard = account.kind === 'card';
    const n = isCard ? Math.max(1, Math.floor(input.installments ?? 1)) : 1;
    // parcela atual: só materializa da `start` até a `n` (parcelas já pagas ficam de fora)
    const start = Math.min(Math.max(1, Math.floor(input.installmentStart ?? 1)), n);
    const parts = splitInstallments(input.amountCents, n);
    const group = n > 1 ? crypto.randomUUID() : null;
    const baseDesc = input.description?.trim() || '';
    const firstIds: UUID[] = [];

    for (let k = 0; k <= n - start; k += 1) {
      const no = start + k;                                  // nº da parcela (1..n)
      const dISO = n > 1 ? addMonthsISO(input.dateISO, k) : input.dateISO;
      const invoiceId = isCard ? await ensureInvoice(account, dISO) : null;
      const ref = refFor(dISO, account, { refMonth: input.refMonth, refYear: input.refYear });
      const { data, error } = await supabase.from('transactions').insert({
        wallet_id: wid,
        account_id: account.id,
        kind: input.kind,
        amount_cents: parts[no - 1],
        date: dISO,
        ref_month: ref.refMonth,
        ref_year: ref.refYear,
        status: input.status ?? 'cleared',
        description: n > 1 ? `${baseDesc} (${no}/${n})` : baseDesc,
        category_id: input.categoryId ?? null,
        member_id: input.memberId ?? null,
        card_invoice_id: invoiceId,
        installment_group: group,
        installment_no: n > 1 ? no : null,
        installment_of: n > 1 ? n : null,
        note: input.note ?? null,
        created_by: userId,
      }).select('id').single();
      if (error) throw error;
      firstIds.push(data.id);
    }

    if (n === 1 && input.splits && input.splits.length > 0) {
      const rows = input.splits.filter((s) => s.shareCents > 0)
        .map((s) => ({ transaction_id: firstIds[0], member_id: s.memberId, share_cents: s.shareCents }));
      if (rows.length) {
        const { error } = await supabase.from('transaction_splits').insert(rows);
        if (error) throw error;
      }
    }
    await reload();
  };

  const updateTransaction: FinanceApi['updateTransaction'] = async (id, patch) => {
    const current = transactions.find((t) => t.id === id);
    if (!current) throw new Error('Lançamento não encontrado.');
    const row: Record<string, unknown> = {};
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
    if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
    if (patch.memberId !== undefined) row.member_id = patch.memberId;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.note !== undefined) row.note = patch.note;

    const nextDate = patch.dateISO ?? current.date;
    const nextAccountId = patch.accountId ?? current.accountId;
    if (patch.dateISO !== undefined) row.date = patch.dateISO;
    if (patch.accountId !== undefined) row.account_id = patch.accountId;

    const acc = accounts.find((a) => a.id === nextAccountId);
    if (patch.dateISO !== undefined || patch.accountId !== undefined) {
      if (acc?.kind === 'card') {
        row.card_invoice_id = await ensureInvoice(acc, nextDate);
      } else {
        row.card_invoice_id = null;
      }
    }
    if (patch.refMonth && patch.refYear && acc?.kind !== 'card') {
      row.ref_month = patch.refMonth;
      row.ref_year = patch.refYear;
    } else if (patch.dateISO !== undefined || patch.accountId !== undefined) {
      const ref = refFor(nextDate, acc, { refMonth: patch.refMonth, refYear: patch.refYear });
      row.ref_month = ref.refMonth;
      row.ref_year = ref.refYear;
    }

    const { error } = await supabase.from('transactions').update(row).eq('id', id);
    if (error) throw error;

    if (patch.splits) {
      await supabase.from('transaction_splits').delete().eq('transaction_id', id);
      const rows = patch.splits.filter((s) => s.shareCents > 0)
        .map((s) => ({ transaction_id: id, member_id: s.memberId, share_cents: s.shareCents }));
      if (rows.length) {
        const { error: sErr } = await supabase.from('transaction_splits').insert(rows);
        if (sErr) throw sErr;
      }
    }
    await reload();
  };

  const deleteTransaction: FinanceApi['deleteTransaction'] = async (id) => {
    const tx = transactions.find((t) => t.id === id);
    if (tx?.transferPeerId) {
      const inv = invoices.find((i) => i.paidTransactionId === id || i.paidTransactionId === tx.transferPeerId);
      if (inv) await supabase.from('card_invoices').update({ status: 'open', paid_transaction_id: null }).eq('id', inv.id);
      await supabase.from('transactions').delete().eq('id', tx.transferPeerId);
    }
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
    await reload();
  };

  const setTransactionStatus: FinanceApi['setTransactionStatus'] = async (id, status) => {
    const { error } = await supabase.from('transactions').update({ status }).eq('id', id);
    if (error) throw error;
    await reload();
  };

  const payCardInvoice: FinanceApi['payCardInvoice'] = async (cardId, month, year, fromAccountId, dateISO, memberId) => {
    const wid = requireWallet();
    const card = accounts.find((a) => a.id === cardId);
    const view = computeInvoiceView(cardId, month, year);
    if (!view.invoice) throw new Error('Não há fatura para este mês.');
    if (view.status === 'paid') throw new Error('Fatura já está paga.');
    if (view.postedCents <= 0) throw new Error('Fatura sem lançamentos.');

    const { m: pm, y: py } = { m: isoParts(dateISO).m, y: isoParts(dateISO).y };
    const label = `Pagamento fatura ${card?.name ?? 'cartão'} ${String(month + 1).padStart(2, '0')}/${year}`;

    const { data: outTx, error: outErr } = await supabase.from('transactions').insert({
      wallet_id: wid, account_id: fromAccountId, kind: 'transfer', amount_cents: view.postedCents,
      date: dateISO, ref_month: pm + 1, ref_year: py, status: 'cleared', description: label,
      member_id: memberId, created_by: userId,
    }).select('id').single();
    if (outErr) throw outErr;

    const { data: inTx, error: inErr } = await supabase.from('transactions').insert({
      wallet_id: wid, account_id: cardId, kind: 'transfer', amount_cents: view.postedCents,
      date: dateISO, ref_month: pm + 1, ref_year: py, status: 'cleared', description: label,
      member_id: memberId, transfer_peer_id: outTx.id, card_invoice_id: view.invoice.id, created_by: userId,
    }).select('id').single();
    if (inErr) throw inErr;

    await supabase.from('transactions').update({ transfer_peer_id: inTx.id }).eq('id', outTx.id);
    const { error: invErr } = await supabase.from('card_invoices')
      .update({ status: 'paid', paid_transaction_id: outTx.id }).eq('id', view.invoice.id);
    if (invErr) throw invErr;
    await reload();
  };

  const unpayCardInvoice: FinanceApi['unpayCardInvoice'] = async (invoiceId) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv?.paidTransactionId) return;
    await supabase.from('card_invoices').update({ status: 'open', paid_transaction_id: null }).eq('id', invoiceId);
    const peer = transactions.find((t) => t.id === inv.paidTransactionId)?.transferPeerId;
    await supabase.from('transactions').delete().in('id', [inv.paidTransactionId, peer].filter(Boolean) as string[]);
    await reload();
  };

  const setInvoiceStatus: FinanceApi['setInvoiceStatus'] = async (invoiceId, status) => {
    const { error } = await supabase.from('card_invoices').update({ status }).eq('id', invoiceId);
    if (error) throw error;
    await reload();
  };

  // --- recorrências -----------------------------------------
  const addRecurrence: FinanceApi['addRecurrence'] = async (r) => {
    const wid = requireWallet();
    const { error } = await supabase.from('recurrences').insert({
      wallet_id: wid, description: r.description, kind: r.kind, amount_cents: r.amountCents,
      category_id: r.categoryId ?? null, account_id: r.accountId ?? null, day: r.day,
      start_date: r.startDate, end_date: r.endDate ?? null,
      autopay: r.autopay ?? false, variable_amount: r.variableAmount ?? false, shared: r.shared ?? false,
    });
    if (error) throw error;
    await reload();
  };

  const updateRecurrence: FinanceApi['updateRecurrence'] = async (id, patch) => {
    const row: Record<string, unknown> = {};
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
    if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
    if (patch.accountId !== undefined) row.account_id = patch.accountId;
    if (patch.day !== undefined) row.day = patch.day;
    if (patch.startDate !== undefined) row.start_date = patch.startDate;
    if (patch.endDate !== undefined) row.end_date = patch.endDate;
    if (patch.autopay !== undefined) row.autopay = patch.autopay;
    if (patch.variableAmount !== undefined) row.variable_amount = patch.variableAmount;
    if (patch.shared !== undefined) row.shared = patch.shared;
    if (patch.active !== undefined) row.active = patch.active;
    const { error } = await supabase.from('recurrences').update(row).eq('id', id);
    if (error) throw error;
    await reload();
  };

  const deleteRecurrence: FinanceApi['deleteRecurrence'] = async (id) => {
    await supabase.from('transactions').update({ recurrence_id: null }).eq('recurrence_id', id);
    const { error } = await supabase.from('recurrences').delete().eq('id', id);
    if (error) throw error;
    await reload();
  };

  /**
   * Cria/atualiza a transação de uma ocorrência de recorrência.
   * `pending` = valor informado sem pagar.
   * `paidOnISO` = dia da baixa: para fixo de cartão, é ele que decide em qual
   * fatura (e competência) o lançamento entra. `date` fica na data nominal da
   * ocorrência (chave estável para casar a ocorrência com a transação).
   */
  /** Zera e (se `shared`) recria a divisão igual entre os membros de uma transação. */
  const syncEvenSplits = async (txId: UUID, shared: boolean, amountCents: number) => {
    await supabase.from('transaction_splits').delete().eq('transaction_id', txId);
    if (!shared || members.length < 2) return;
    const parts = splitInstallments(amountCents, members.length);
    const rows = members
      .map((m, i) => ({ transaction_id: txId, member_id: m.userId, share_cents: parts[i] }))
      .filter((r) => r.share_cents > 0);
    if (rows.length) {
      const { error } = await supabase.from('transaction_splits').insert(rows);
      if (error) throw error;
    }
  };

  const upsertRecurrenceTx = async (
    recurrenceId: UUID, month: number, year: number,
    amountCents: number, memberId: UUID | null, status: TxStatus,
    paidOnISO?: string, shared?: boolean, accountIdOverride?: UUID,
  ) => {
    const wid = requireWallet();
    const rec = recurrences.find((r) => r.id === recurrenceId);
    if (!rec) throw new Error('Recorrência não encontrada.');
    const existing = transactions.find((t) => t.recurrenceId === recurrenceId && isInMonth(t.date, month, year));
    // nunca rebaixa uma ocorrência já paga para pendente
    const nextStatus: TxStatus = existing?.status === 'cleared' ? 'cleared' : status;

    // conta: override do diálogo de pagamento > conta da recorrência > 1ª conta de dinheiro
    const overrideAcc = accountIdOverride ? accounts.find((a) => a.id === accountIdOverride) : null;
    const account = overrideAcc
      ?? (rec.accountId ? accounts.find((a) => a.id === rec.accountId) : null)
      ?? spendingAccountsMemo[0];
    if (!account) throw new Error('Defina uma forma de pagamento para esta recorrência (Fixos → editar).');
    const onCard = account.kind === 'card';
    const dueISO = recurrenceDueISO(year, month, rec.day);
    const chargeISO = paidOnISO ?? dueISO;
    // cartão: fatura/competência seguem o dia da baixa; senão competência = mês da ocorrência
    const ref = onCard ? refFor(chargeISO, account) : { refMonth: month + 1, refYear: year };
    const applyShared = (shared ?? rec.shared) && nextStatus === 'cleared';

    if (existing) {
      const patch: Record<string, unknown> = { amount_cents: amountCents, status: nextStatus };
      if (nextStatus === 'cleared') patch.member_id = memberId;
      if (overrideAcc && !onCard) patch.account_id = account.id;
      if (paidOnISO) {
        patch.ref_month = ref.refMonth;
        patch.ref_year = ref.refYear;
        if (onCard) patch.card_invoice_id = await ensureInvoice(account, chargeISO);
      }
      await supabase.from('transactions').update(patch).eq('id', existing.id);
      await syncEvenSplits(existing.id, applyShared, amountCents);
      await reload();
      return;
    }

    const invoiceId = onCard ? await ensureInvoice(account, chargeISO) : null;
    const { data, error } = await supabase.from('transactions').insert({
      wallet_id: wid, account_id: account.id, kind: rec.kind, amount_cents: amountCents,
      date: dueISO, ref_month: ref.refMonth, ref_year: ref.refYear, status: nextStatus,
      description: rec.description, category_id: rec.categoryId,
      member_id: nextStatus === 'cleared' ? memberId : null,
      recurrence_id: rec.id, card_invoice_id: invoiceId, created_by: userId,
    }).select('id').single();
    if (error) throw error;
    if (applyShared) await syncEvenSplits(data.id, true, amountCents);
    await reload();
  };

  const markRecurrenceOccurrence: FinanceApi['markRecurrenceOccurrence'] = (recurrenceId, month, year, amountCents, memberId, paidOnISO, shared, accountId) =>
    upsertRecurrenceTx(recurrenceId, month, year, amountCents, memberId, 'cleared', paidOnISO ?? today, shared, accountId);

  const setRecurrenceOccurrenceAmount: FinanceApi['setRecurrenceOccurrenceAmount'] = (recurrenceId, month, year, amountCents) =>
    upsertRecurrenceTx(recurrenceId, month, year, amountCents, null, 'pending');

  const unmarkRecurrenceOccurrence: FinanceApi['unmarkRecurrenceOccurrence'] = async (recurrenceId, month, year) => {
    const existing = transactions.find((t) => t.recurrenceId === recurrenceId && isInMonth(t.date, month, year));
    if (!existing) return;
    const { error } = await supabase.from('transactions').delete().eq('id', existing.id);
    if (error) throw error;
    await reload();
  };

  // --- investimentos ------------------------------------
  const addInvestment: FinanceApi['addInvestment'] = async (i) => {
    const wid = requireWallet();
    const { error } = await supabase.from('investments').insert({
      wallet_id: wid, description: i.description, amount_cents: i.amountCents,
      yield_rate_bps: i.yieldRateBps, date: i.dateISO, member_id: i.memberId ?? null,
    });
    if (error) throw error;
    await reload();
  };

  const updateInvestment: FinanceApi['updateInvestment'] = async (id, patch) => {
    const row: Record<string, unknown> = {};
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
    if (patch.yieldRateBps !== undefined) row.yield_rate_bps = patch.yieldRateBps;
    if (patch.dateISO !== undefined) row.date = patch.dateISO;
    if (patch.memberId !== undefined) row.member_id = patch.memberId;
    const { error } = await supabase.from('investments').update(row).eq('id', id);
    if (error) throw error;
    await reload();
  };

  const deleteInvestment: FinanceApi['deleteInvestment'] = async (id) => {
    const { error } = await supabase.from('investments').delete().eq('id', id);
    if (error) throw error;
    await reload();
  };

  const updateSettings: FinanceApi['updateSettings'] = async (patch) => {
    const wid = requireWallet();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.initialInvestmentCents !== undefined) row.initial_investment_cents = patch.initialInvestmentCents;
    if (patch.defaultYieldBps !== undefined) row.default_yield_bps = patch.defaultYieldBps;
    const { error } = await supabase.from('wallet_settings').update(row).eq('wallet_id', wid);
    if (error) throw error;
    setSettings((s) => (s ? { ...s, ...patch } : s));
  };

  const lockPeriod: FinanceApi['lockPeriod'] = async (month, year) => {
    const wid = requireWallet();
    const { error } = await supabase.from('period_locks')
      .insert({ wallet_id: wid, ref_month: month + 1, ref_year: year, locked_by: userId });
    if (error && error.code !== '23505') throw error;
    await reload();
  };

  const unlockPeriod: FinanceApi['unlockPeriod'] = async (month, year) => {
    const wid = requireWallet();
    const { error } = await supabase.from('period_locks').delete()
      .eq('wallet_id', wid).eq('ref_month', month + 1).eq('ref_year', year);
    if (error) throw error;
    await reload();
  };

  // --- seletores --------------------------------------
  const spendingAccountsMemo = useMemo(
    () => accounts.filter((a) => a.kind !== 'card' && !a.archived), [accounts],
  );
  const cardsMemo = useMemo(() => accounts.filter((a) => a.kind === 'card' && !a.archived), [accounts]);
  const activeCategoriesMemo = useMemo(() => categories.filter((c) => !c.archived), [categories]);

  const categoryName = useCallback((id?: UUID | null) => categories.find((c) => c.id === id)?.name ?? '—', [categories]);
  const memberName = useCallback((id?: UUID | null) => members.find((m) => m.userId === id)?.profile?.name ?? '—', [members]);
  const accountName = useCallback((id?: UUID | null) => accounts.find((a) => a.id === id)?.name ?? '—', [accounts]);

  const accountBalanceCents = useCallback((accountId: UUID, uptoISO?: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return 0;
    const upto = uptoISO ?? today;
    let total = acc.openingBalanceCents;
    for (const t of transactions) {
      if (t.accountId !== accountId || t.status !== 'cleared' || t.date > upto) continue;
      if (t.kind === 'income') total += t.amountCents;
      else if (t.kind === 'expense') total -= t.amountCents;
      else total += acc.kind === 'card' ? t.amountCents : -t.amountCents;
    }
    return total;
  }, [accounts, transactions, today]);

  const cashBalanceCents = useCallback((uptoISO?: string) =>
    spendingAccountsMemo.reduce((sum, a) => sum + accountBalanceCents(a.id, uptoISO), 0),
    [spendingAccountsMemo, accountBalanceCents]);

  const cardCommittedCents = useCallback((cardId: UUID) => {
    const openIds = new Set(invoices.filter((i) => i.accountId === cardId && i.status !== 'paid').map((i) => i.id));
    return transactions
      .filter((t) => t.accountId === cardId && t.kind === 'expense' && t.cardInvoiceId && openIds.has(t.cardInvoiceId))
      .reduce((s, t) => s + t.amountCents, 0);
  }, [invoices, transactions]);

  const cardAvailableCents = useCallback((cardId: UUID) => {
    const card = accounts.find((a) => a.id === cardId);
    return (card?.creditLimitCents ?? 0) - cardCommittedCents(cardId);
  }, [accounts, cardCommittedCents]);

  /** fixos de cartão previstos que ainda não viraram lançamento nesta fatura */
  const projectedCardFixos = (cardId: UUID, month: number, year: number) => {
    const card = accounts.find((a) => a.id === cardId);
    if (!card) return [] as { recurrence: Recurrence; dueISO: string; amountCents: number }[];
    const closing = card.closingDay ?? 1;
    const out: { recurrence: Recurrence; dueISO: string; amountCents: number }[] = [];
    for (const offset of [0, -1]) {
      const obl = new Date(year, month + offset, 1);
      const oM = obl.getMonth(); const oY = obl.getFullYear();
      const mStart = dayOfMonthISO(oY, oM, 1);
      const mEnd = dayOfMonthISO(oY, oM + 1, 0);
      for (const r of recurrences) {
        if (r.accountId !== cardId || r.kind !== 'expense' || !r.active) continue;
        if (r.startDate > mEnd || (r.endDate && r.endDate < mStart)) continue;
        const dueISO = recurrenceDueISO(oY, oM, r.day);
        const inv = resolveInvoiceRef(dueISO, closing);
        if (inv.refMonth !== month + 1 || inv.refYear !== year) continue;
        const already = transactions.some((t) => t.recurrenceId === r.id && t.refMonth === month + 1 && t.refYear === year);
        if (already) continue;
        out.push({ recurrence: r, dueISO, amountCents: r.amountCents });
      }
    }
    return out;
  };

  const computeInvoiceView = (cardId: UUID, month: number, year: number): InvoiceView => {
    const refMonth = month + 1;
    const invoice = invoices.find((i) => i.accountId === cardId && i.refMonth === refMonth && i.refYear === year) ?? null;
    const posted = invoice
      ? transactions.filter((t) => t.cardInvoiceId === invoice.id && t.kind === 'expense')
      : [];
    const postedCents = posted.reduce((s, t) => s + t.amountCents, 0);
    const projected = projectedCardFixos(cardId, month, year);
    const rows: InvoiceRow[] = [
      ...posted.map((t) => ({
        key: t.id, description: t.description || '—', dateISO: t.date, amountCents: t.amountCents,
        type: (t.recurrenceId ? 'fixo' : 'variavel') as InvoiceRow['type'], projected: false,
      })),
      ...projected.map((p) => ({
        key: `proj:${p.recurrence.id}`, description: p.recurrence.description, dateISO: p.dueISO,
        amountCents: p.amountCents, type: 'previsto' as const, projected: true,
      })),
    ].sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
    return {
      invoice,
      status: invoice?.status ?? 'open',
      postedCents,
      projectedCents: postedCents + projected.reduce((s, p) => s + p.amountCents, 0),
      rows,
    };
  };
  const invoiceView = useCallback(computeInvoiceView, [invoices, transactions, recurrences, accounts]);

  const monthTransactionsByDate = useCallback(
    (month: number, year: number) => transactions.filter((t) => isInMonth(t.date, month, year)),
    [transactions],
  );
  const monthTransactionsByRef = useCallback(
    (month: number, year: number) => transactions.filter((t) => t.refMonth === month + 1 && t.refYear === year),
    [transactions],
  );

  const recurrenceOccurrences = useCallback((month: number, year: number): OccurrenceView[] => {
    const mStart = dayOfMonthISO(year, month, 1);
    const mEnd = dayOfMonthISO(year, month + 1, 0);
    return recurrences
      .filter((r) => r.active && r.startDate <= mEnd && (!r.endDate || r.endDate >= mStart))
      .map((r) => {
        const tx = transactions.find((t) => t.recurrenceId === r.id && isInMonth(t.date, month, year));
        const acc = r.accountId ? accounts.find((a) => a.id === r.accountId) : null;
        return {
          recurrence: r,
          dueDateISO: recurrenceDueISO(year, month, r.day),
          txId: tx?.id ?? null,
          status: tx ? (tx.status === 'cleared' ? 'paid' : 'pending') : 'none',
          amountCents: tx?.amountCents ?? r.amountCents,
          estimatedCents: r.amountCents,
          onCard: acc?.kind === 'card',
        } as OccurrenceView;
      })
      .sort((a, b) => a.recurrence.day - b.recurrence.day);
  }, [recurrences, transactions, accounts]);

  const spendByMember = useCallback((month: number, year: number): MemberSpend[] => {
    const cardIds = new Set(cardsMemo.map((c) => c.id));
    const totals: Record<string, number> = {};
    for (const t of transactions) {
      if (t.kind !== 'expense' || t.status !== 'cleared') continue;
      if (t.refMonth !== month + 1 || t.refYear !== year) continue;
      if (t.splits.length > 0) {
        // gasto compartilhado: cada membro carrega a sua parte
        for (const s of t.splits) totals[s.memberId] = (totals[s.memberId] ?? 0) + s.shareCents;
      } else if (t.memberId) {
        totals[t.memberId] = (totals[t.memberId] ?? 0) + t.amountCents;
      }
    }
    return members
      .map((m) => ({ memberId: m.userId, totalCents: totals[m.userId] ?? 0 }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }, [transactions, members, cardsMemo]);

  const isPeriodLocked = useCallback(
    (month: number, year: number) => periodLocks.some((l) => l.refMonth === month + 1 && l.refYear === year),
    [periodLocks],
  );

  const wouldOverdraw = useCallback((accountId: UUID, amountCents: number) => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc || acc.kind === 'card') return false;
    return accountBalanceCents(accountId) - amountCents < 0;
  }, [accounts, accountBalanceCents]);

  const wouldExceedLimit = useCallback((cardId: UUID, amountCents: number) => {
    const card = accounts.find((a) => a.id === cardId);
    if (card?.kind !== 'card' || card.creditLimitCents == null) return false;
    return cardCommittedCents(cardId) + amountCents > card.creditLimitCents;
  }, [accounts, cardCommittedCents]);

  const monthSummary = useCallback((month: number, year: number): MonthSummary => {
    const cardIds = new Set(cardsMemo.map((c) => c.id));
    const refTx = transactions.filter((t) => t.refMonth === month + 1 && t.refYear === year);

    const incomeRealizedCents = refTx
      .filter((t) => t.kind === 'income' && t.status === 'cleared').reduce((s, t) => s + t.amountCents, 0);
    const directExpenseRealized = refTx
      .filter((t) => t.kind === 'expense' && t.status === 'cleared' && !cardIds.has(t.accountId))
      .reduce((s, t) => s + t.amountCents, 0);

    let cardBillCents = 0;
    let cardOpenCents = 0;
    let projectedCardCents = 0;
    for (const card of cardsMemo) {
      const v = computeInvoiceView(card.id, month, year);
      cardBillCents += v.postedCents;
      if (v.status !== 'paid') cardOpenCents += v.postedCents;
      projectedCardCents += v.projectedCents - v.postedCents;
    }
    const cardPaidCents = cardBillCents - cardOpenCents;

    const occ = recurrenceOccurrences(month, year).filter((o) => o.status !== 'paid');
    const pendingIncomeCents = occ.filter((o) => o.recurrence.kind === 'income').reduce((s, o) => s + o.amountCents, 0);
    const pendingNonCardExpense = occ
      .filter((o) => o.recurrence.kind === 'expense' && !o.onCard)
      .reduce((s, o) => s + o.amountCents, 0);
    const pendingBoletos = refTx
      .filter((t) => t.kind === 'expense' && t.status === 'pending' && !cardIds.has(t.accountId) && !t.recurrenceId)
      .reduce((s, t) => s + t.amountCents, 0);

    const cashBalance = cashBalanceCents();
    const pendingExpenseCents = pendingNonCardExpense + pendingBoletos + cardOpenCents + projectedCardCents;

    return {
      incomeRealizedCents,
      expenseRealizedCents: directExpenseRealized + cardPaidCents,
      pendingIncomeCents,
      pendingExpenseCents,
      cardBillCents,
      cardOpenCents,
      cashBalanceCents: cashBalance,
      projectedBalanceCents: cashBalance + pendingIncomeCents - pendingExpenseCents,
    };
  }, [transactions, cardsMemo, recurrenceOccurrences, cashBalanceCents]);

  const totalInvestedCents = useCallback(
    () => (settings?.initialInvestmentCents ?? 0) + investments.reduce((s, i) => s + i.amountCents, 0),
    [settings, investments],
  );
  const investmentMonthlyYieldCents = useCallback(
    () => investments.reduce((s, i) => s + Math.round(i.amountCents * (i.yieldRateBps / 10000)), 0),
    [investments],
  );

  const memberBalances = useCallback((): MemberBalance[] => {
    const net: Record<UUID, number> = {};
    members.forEach((m) => { net[m.userId] = 0; });
    transactions
      .filter((t) => t.kind === 'expense' && t.status === 'cleared' && t.memberId && t.splits.length > 0)
      .forEach((t) => {
        const payer = t.memberId as UUID;
        t.splits.forEach((s) => {
          if (s.memberId === payer) return;
          net[payer] = (net[payer] ?? 0) + s.shareCents;
          net[s.memberId] = (net[s.memberId] ?? 0) - s.shareCents;
        });
      });
    return Object.entries(net).map(([memberId, netCents]) => ({ memberId, netCents }));
  }, [members, transactions]);

  const settlements = useCallback((): Settlement[] => {
    const bal = memberBalances().map((b) => ({ ...b }));
    const debtors = bal.filter((b) => b.netCents < 0).sort((a, b) => a.netCents - b.netCents);
    const creditors = bal.filter((b) => b.netCents > 0).sort((a, b) => b.netCents - a.netCents);
    const out: Settlement[] = [];
    let i = 0; let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(-debtors[i].netCents, creditors[j].netCents);
      if (amount > 0) out.push({ fromId: debtors[i].memberId, toId: creditors[j].memberId, amountCents: amount });
      debtors[i].netCents += amount;
      creditors[j].netCents -= amount;
      if (debtors[i].netCents === 0) i += 1;
      if (creditors[j].netCents === 0) j += 1;
    }
    return out;
  }, [memberBalances]);

  const wallet = wallets.find((w) => w.id === walletId) ?? null;
  const role = members.find((m) => m.userId === userId)?.role ?? null;

  const value: FinanceApi = {
    loading, userId, profile, today, wallets, walletId, wallet, role, members,
    accounts, categories, recurrences, invoices, transactions, investments, settings, periodLocks, selectedMonth,
    setWallet, setSelectedMonth, reload,
    cards: cardsMemo, spendingAccounts: spendingAccountsMemo, activeCategories: activeCategoriesMemo,
    categoryName, memberName, accountName,
    accountBalanceCents, cashBalanceCents, cardCommittedCents, cardAvailableCents,
    invoiceView, monthTransactionsByDate, monthTransactionsByRef, monthSummary, recurrenceOccurrences,
    spendByMember, isPeriodLocked, wouldOverdraw, wouldExceedLimit,
    totalInvestedCents, investmentMonthlyYieldCents, memberBalances, settlements,
    updateProfile, createWallet, renameWallet, deleteWallet, addMemberByEmail, removeMember,
    addAccount, updateAccount, deleteAccount,
    addCategory, updateCategory, deleteCategory,
    addTransaction, updateTransaction, deleteTransaction, setTransactionStatus,
    payCardInvoice, unpayCardInvoice, setInvoiceStatus,
    addRecurrence, updateRecurrence, deleteRecurrence,
    markRecurrenceOccurrence, setRecurrenceOccurrenceAmount, unmarkRecurrenceOccurrence,
    addInvestment, updateInvestment, deleteInvestment,
    updateSettings, lockPeriod, unlockPeriod,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};
