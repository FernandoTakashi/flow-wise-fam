import {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { spDateISO, todayISO } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { apiFetch } from '@/lib/api';
import * as core from '@/core';
import { accountBalance, cardCommitted } from '@/core';
import type {
  FinanceData, OccurrenceView, InvoiceView, MemberSpend, MonthSummary,
} from '@/core';
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
const mapProfile = (r: any): Profile => ({
  id: r.id, name: r.name ?? '', email: r.email, onboarding: r.onboarding ?? {},
});
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
  installmentsTotal: r.installments_total == null ? null : Number(r.installments_total),
  installmentsDone: Number(r.installments_done ?? 0),
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
  occMonth: r.occ_month ?? null, occYear: r.occ_year ?? null,
  installmentGroup: r.installment_group, installmentNo: r.installment_no, installmentOf: r.installment_of,
  transferPeerId: r.transfer_peer_id, note: r.note, shared: !!r.shared, createdBy: r.created_by, source: r.source ?? 'app',
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

// --- snapshot da carteira (API própria com fallback pro Supabase direto) ---
interface SnapshotRows {
  members: unknown[]; accounts: unknown[]; categories: unknown[]; recurrences: unknown[];
  invoices: unknown[]; transactions: unknown[]; investments: unknown[];
  settings: unknown | null; periodLocks: unknown[]; locksError?: string;
}

async function fetchWalletSnapshotDirect(wid: string): Promise<SnapshotRows> {
  const [m, a, c, rec, inv, tx, i, s, l] = await Promise.all([
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
  for (const res of [m, a, c, rec, inv, tx, i]) if (res.error) throw res.error;
  return {
    members: m.data ?? [], accounts: a.data ?? [], categories: c.data ?? [], recurrences: rec.data ?? [],
    invoices: inv.data ?? [], transactions: tx.data ?? [], investments: i.data ?? [],
    settings: s.data ?? null, periodLocks: l.data ?? [], locksError: l.error?.message,
  };
}

async function fetchWalletSnapshot(wid: string): Promise<SnapshotRows> {
  try {
    const r = await apiFetch<SnapshotRows & { warnings?: string[] }>(`/snapshot?wallet=${encodeURIComponent(wid)}`);
    return { ...r, locksError: (r.warnings ?? []).find((w) => w.startsWith('period_locks')) };
  } catch (e) {
    console.warn('[finance] /api/v1/snapshot indisponível, usando Supabase direto:', (e as Error).message);
    return fetchWalletSnapshotDirect(wid);
  }
}

async function fetchWalletsListDirect(uid: string): Promise<unknown[]> {
  const { data, error } = await supabase
    .from('wallet_members')
    .select('wallet_id, role, wallets(id, name, base_currency, created_by)')
    .eq('user_id', uid);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { wallets?: unknown }).wallets).filter(Boolean);
}

async function fetchWalletsList(uid: string): Promise<unknown[]> {
  try {
    const r = await apiFetch<{ wallets: unknown[] }>('/wallets');
    return r.wallets ?? [];
  } catch (e) {
    console.warn('[finance] /api/v1/wallets indisponível, usando Supabase direto:', (e as Error).message);
    return fetchWalletsListDirect(uid);
  }
}

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
  /** marca como gasto em conjunto (só expense) */
  shared?: boolean;
}
export interface NewRecurrence {
  description: string; kind: CategoryKind; amountCents: number;
  categoryId?: UUID | null; accountId?: UUID | null; day: number;
  startDate: string; endDate?: string | null; autopay?: boolean; variableAmount?: boolean; shared?: boolean;
  installmentsTotal?: number | null; installmentsDone?: number;
}
export interface NewInvestment {
  description: string; amountCents: number; yieldRateBps: number; dateISO: string; memberId?: UUID | null;
}

// Tipos de leitura vivem em `src/core`; re-exportados para quem importa
// de '@/contexts/FinanceContext'.
export type { OccurrenceView, InvoiceRow, InvoiceView, MemberSpend, MonthSummary } from '@/core';

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
  jointSpendCents(month: number, year: number): number;
  isPeriodLocked(month: number, year: number): boolean;
  wouldOverdraw(accountId: UUID, amountCents: number): boolean;
  wouldExceedLimit(cardId: UUID, amountCents: number): boolean;
  totalInvestedCents(): number;
  investmentMonthlyYieldCents(): number;
  memberBalances(): MemberBalance[];
  settlements(): Settlement[];

  updateProfile(patch: { name: string }): Promise<void>;
  /** Mescla `patch` em profile.onboarding (não substitui o objeto inteiro). */
  updateOnboarding(patch: Partial<{ wizardDone: boolean; tips: Record<string, boolean> }>): Promise<void>;
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

  // Retrato imutável da carteira — entrada de todos os seletores de `@/core`.
  const data: FinanceData = useMemo(() => ({
    transactions, accounts, categories, recurrences, invoices, investments,
    members, periodLocks, settings, today,
  }), [transactions, accounts, categories, recurrences, invoices, investments, members, periodLocks, settings, today]);

  const serverNow = useCallback(() => new Date(Date.now() + skewRef.current), []);
  const computeToday = useCallback(() => setToday(spDateISO(new Date(Date.now() + skewRef.current))), []);

  const persistWallet = (id: UUID | null) => {
    try { if (id) localStorage.setItem(WALLET_KEY, id); } catch { /* ignore */ }
  };

  // --- carregamento ----------------------------------------------------
  const loadWallets = useCallback(async (uid: UUID): Promise<UUID | null> => {
    const rows = await fetchWalletsList(uid);
    const list = rows.map(mapWallet);
    setWallets(list);
    const chosen = list.find((w) => w.id === walletIdRef.current)?.id ?? list[0]?.id ?? null;
    setWalletId(chosen);
    persistWallet(chosen);
    return chosen;
  }, []);

  const loadWalletData = useCallback(async (wid: UUID) => {
    const rows = await fetchWalletSnapshot(wid);
    if (rows.locksError) console.warn('[finance] period_locks indisponível (rode a migration 2):', rows.locksError);

    setMembers(rows.members.map(mapMember));
    setAccounts(rows.accounts.map(mapAccount));
    setCategories(rows.categories.map(mapCategory));
    setRecurrences(rows.recurrences.map(mapRecurrence));
    setInvoices(rows.invoices.map(mapInvoice));
    setTransactions(rows.transactions.map(mapTransaction));
    setInvestments(rows.investments.map(mapInvestment));
    setPeriodLocks(rows.periodLocks.map(mapLock));

    let s = rows.settings;
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

      let chosen = await loadWallets(user.id);
      if (!chosen) {
        // auto-heal: conta sem carteira (trigger de onboarding falhou / conta antiga)
        const { data: healedId, error } = await supabase.rpc('create_wallet', { p_name: 'Minha Carteira' });
        if (!error && healedId) chosen = await loadWallets(user.id);
      }
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

  // --- perfil / carteira / membros --------------------------------
  const updateProfile: FinanceApi['updateProfile'] = async ({ name }) => {
    if (!userId) return;
    const { error } = await supabase.from('profiles').update({ name }).eq('id', userId);
    if (error) throw error;
    setProfile((p) => (p ? { ...p, name } : p));
  };

  const updateOnboarding: FinanceApi['updateOnboarding'] = async (patch) => {
    if (!userId) return;
    const current = profile?.onboarding ?? {};
    const merged = {
      ...current,
      ...patch,
      tips: { ...(current.tips ?? {}), ...(patch.tips ?? {}) },
    };
    const { error } = await supabase.from('profiles').update({ onboarding: merged }).eq('id', userId);
    if (error) throw error;
    setProfile((p) => (p ? { ...p, onboarding: merged } : p));
  };

  const createWallet: FinanceApi['createWallet'] = async (name) => {
    if (!userId) throw new Error('Sem sessão.');
    // RPC atômico: cria carteira + associa o dono + faz o seed numa transação só.
    const { data: id, error } = await supabase.rpc('create_wallet', { p_name: name });
    if (error) throw error;
    const newId = id as UUID;
    await loadWallets(userId);
    setWallet(newId);
    return newId;
  };

  const renameWallet: FinanceApi['renameWallet'] = async (id, name) => {
    await apiFetch('/crud', { method: 'PATCH', body: JSON.stringify({ resource: 'wallet', walletId: id, name }) });
    await loadWallets(userId!);
  };

  const deleteWallet: FinanceApi['deleteWallet'] = async (id) => {
    if (wallets.length <= 1) throw new Error('Você precisa manter ao menos uma carteira.');
    await apiFetch('/crud', { method: 'DELETE', body: JSON.stringify({ resource: 'wallet', walletId: id }) });
    const next = await loadWallets(userId!);
    if (next) await loadWalletData(next);
  };

  const addMemberByEmail: FinanceApi['addMemberByEmail'] = async (email) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'POST', body: JSON.stringify({ resource: 'member', walletId: wid, email: email.trim() }) });
    await reload();
  };

  const removeMember: FinanceApi['removeMember'] = async (uid) => {
    const wid = requireWallet();
    if (uid === userId) throw new Error('Use "sair da carteira" para remover a si mesmo.');
    await apiFetch('/crud', { method: 'DELETE', body: JSON.stringify({ resource: 'member', walletId: wid, userId: uid }) });
    await reload();
  };

  // --- contas ----------------------------------------------------
  const addAccount: FinanceApi['addAccount'] = async (a) => {
    const wid = requireWallet();
    await apiFetch('/crud', {
      method: 'POST',
      body: JSON.stringify({
        resource: 'account', walletId: wid, name: a.name, kind: a.kind, openingBalanceCents: a.openingBalanceCents ?? 0,
        closingDay: a.kind === 'card' ? a.closingDay ?? null : null,
        dueDay: a.kind === 'card' ? a.dueDay ?? null : null,
        creditLimitCents: a.kind === 'card' ? a.creditLimitCents ?? null : null,
      }),
    });
    await reload();
  };

  const updateAccount: FinanceApi['updateAccount'] = async (id, patch) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'PATCH', body: JSON.stringify({ resource: 'account', walletId: wid, id, ...patch }) });
    await reload();
  };

  const deleteAccount: FinanceApi['deleteAccount'] = async (id) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'DELETE', body: JSON.stringify({ resource: 'account', walletId: wid, id }) });
    await reload();
  };

  // --- categorias ---------------------------------------------
  const addCategory: FinanceApi['addCategory'] = async (c) => {
    const wid = requireWallet();
    await apiFetch('/crud', {
      method: 'POST',
      body: JSON.stringify({ resource: 'category', walletId: wid, name: c.name, kind: c.kind, icon: c.icon ?? null, color: c.color ?? null }),
    });
    await reload();
  };

  const updateCategory: FinanceApi['updateCategory'] = async (id, patch) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'PATCH', body: JSON.stringify({ resource: 'category', walletId: wid, id, ...patch }) });
    await reload();
  };

  const deleteCategory: FinanceApi['deleteCategory'] = async (id) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'DELETE', body: JSON.stringify({ resource: 'category', walletId: wid, id }) });
    await reload();
  };

  // --- transações --------------------------------------------
  const addTransaction: FinanceApi['addTransaction'] = async (input) => {
    const wid = requireWallet();
    const account = accounts.find((a) => a.id === input.accountId);
    if (!account) throw new Error('Conta inválida.');

    const isCard = account.kind === 'card';

    // limites rígidos: mensagem amigável na hora, sem esperar o round-trip da
    // API (o banco também barra do lado de lá, via enforce_spend_limits).
    if (input.kind === 'expense' && (input.status ?? 'cleared') === 'cleared') {
      if (isCard && account.creditLimitCents != null) {
        const free = account.creditLimitCents - cardCommitted(account.id, transactions, invoices);
        if (input.amountCents > free) {
          throw new Error(`Ultrapassa o limite do cartão ${account.name} — livre: ${formatBRL(free)}.`);
        }
      } else if (!isCard) {
        const bal = accountBalance(account, transactions, today);
        if (bal - input.amountCents < 0) {
          throw new Error(`Saldo insuficiente em ${account.name} — disponível: ${formatBRL(bal)}.`);
        }
      }
    }

    // escrita de verdade passa pela API própria (POST /api/v1/crud), que
    // reusa a mesma insertEntry() do bot do Telegram.
    await apiFetch('/crud', {
      method: 'POST',
      body: JSON.stringify({
        resource: 'transaction',
        walletId: wid,
        kind: input.kind,
        description: input.description?.trim() || '',
        amountCents: input.amountCents,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        dateISO: input.dateISO,
        note: input.note ?? null,
        installments: input.installments ?? null,
        installmentStart: input.installmentStart ?? null,
        shared: input.shared ?? null,
        memberId: input.memberId ?? null,
        status: input.status ?? 'cleared',
        refMonth: input.refMonth ?? null,
        refYear: input.refYear ?? null,
      }),
    });
    await reload();
  };

  const updateTransaction: FinanceApi['updateTransaction'] = async (id, patch) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'PATCH', body: JSON.stringify({ resource: 'transaction', walletId: wid, id, ...patch }) });
    await reload();
  };

  const deleteTransaction: FinanceApi['deleteTransaction'] = async (id) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'DELETE', body: JSON.stringify({ resource: 'transaction', walletId: wid, id }) });
    await reload();
  };

  const setTransactionStatus: FinanceApi['setTransactionStatus'] = async (id, status) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'PATCH', body: JSON.stringify({ resource: 'transaction', walletId: wid, id, status }) });
    await reload();
  };

  const payCardInvoice: FinanceApi['payCardInvoice'] = async (cardId, month, year, fromAccountId, dateISO, memberId) => {
    const wid = requireWallet();
    const card = accounts.find((a) => a.id === cardId);
    const fromAcc = accounts.find((a) => a.id === fromAccountId);
    if (!fromAcc || fromAcc.kind === 'card') throw new Error('Escolha uma conta de dinheiro para pagar a fatura.');
    const view = core.computeInvoiceView(data, cardId, month, year);
    if (!view.invoice) throw new Error('Não há fatura para este mês.');
    if (view.status === 'paid') throw new Error('Fatura já está paga.');
    if (view.postedCents <= 0) throw new Error('Fatura sem lançamentos.');

    // mensagem amigável na hora; a trigger do banco é quem barra de verdade
    const fromBal = accountBalance(fromAcc, transactions, today);
    if (fromBal < view.postedCents) {
      throw new Error(`Saldo insuficiente em ${fromAcc.name} — disponível: ${formatBRL(fromBal)}, fatura: ${formatBRL(view.postedCents)}.`);
    }

    await apiFetch('/actions', {
      method: 'POST',
      body: JSON.stringify({
        resource: 'invoice', walletId: wid, action: 'pay', cardId, cardName: card?.name ?? 'cartão',
        fromAccountId, month, year, dateISO, memberId,
      }),
    });
    await reload();
  };

  const unpayCardInvoice: FinanceApi['unpayCardInvoice'] = async (invoiceId) => {
    const wid = requireWallet();
    await apiFetch('/actions', { method: 'POST', body: JSON.stringify({ resource: 'invoice', walletId: wid, action: 'unpay', invoiceId }) });
    await reload();
  };

  const setInvoiceStatus: FinanceApi['setInvoiceStatus'] = async (invoiceId, status) => {
    const wid = requireWallet();
    await apiFetch('/actions', { method: 'POST', body: JSON.stringify({ resource: 'invoice', walletId: wid, action: 'setStatus', invoiceId, status }) });
    await reload();
  };

  // --- recorrências -----------------------------------------
  const addRecurrence: FinanceApi['addRecurrence'] = async (r) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'POST', body: JSON.stringify({ resource: 'recurrence', walletId: wid, ...r }) });
    await reload();
  };

  const updateRecurrence: FinanceApi['updateRecurrence'] = async (id, patch) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'PATCH', body: JSON.stringify({ resource: 'recurrence', walletId: wid, id, ...patch }) });
    await reload();
  };

  const deleteRecurrence: FinanceApi['deleteRecurrence'] = async (id) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'DELETE', body: JSON.stringify({ resource: 'recurrence', walletId: wid, id }) });
    await reload();
  };

  /**
   * Cria/atualiza a transação de uma ocorrência de recorrência.
   * `pending` = valor informado sem pagar.
   * `paidOnISO` = dia da baixa: para fixo de cartão, é ele que decide em qual
   * fatura (e competência) o lançamento entra.
   * `shared` (default = flag da recorrência) só marca o lançamento como
   * "gasto em conjunto" — não divide contas.
   */
  const upsertRecurrenceTx = async (
    recurrenceId: UUID, month: number, year: number,
    amountCents: number, memberId: UUID | null, status: TxStatus,
    paidOnISO?: string, shared?: boolean, accountIdOverride?: UUID,
  ) => {
    const wid = requireWallet();
    const rec = recurrences.find((r) => r.id === recurrenceId);
    if (!rec) throw new Error('Recorrência não encontrada.');

    // mensagens amigáveis na hora; o banco (trigger de limite + markOccurrence
    // no servidor) é a fonte da verdade
    if (status === 'cleared') {
      const overrideAcc = accountIdOverride ? accounts.find((a) => a.id === accountIdOverride) : null;
      const account = overrideAcc
        ?? (rec.accountId ? accounts.find((a) => a.id === rec.accountId) : null)
        ?? spendingAccountsMemo[0];
      if (!account) throw new Error('Defina uma forma de pagamento para esta recorrência (Fixos → editar).');
      const onCard = account.kind === 'card';
      if (rec.kind === 'expense') {
        if (onCard && account.creditLimitCents != null) {
          const free = account.creditLimitCents - cardCommitted(account.id, transactions, invoices);
          if (amountCents > free) throw new Error(`Ultrapassa o limite do cartão ${account.name} — livre: ${formatBRL(free)}.`);
        } else if (!onCard) {
          const bal = accountBalance(account, transactions, today);
          if (bal - amountCents < 0) throw new Error(`Saldo insuficiente em ${account.name} — disponível: ${formatBRL(bal)}.`);
        }
      }
    }

    await apiFetch('/actions', {
      method: 'POST',
      body: JSON.stringify({
        resource: 'occurrence', walletId: wid, recurrenceId, month, year,
        action: status === 'cleared' ? 'mark' : 'setAmount',
        amountCents, memberId, paidOnISO, shared, accountId: accountIdOverride ?? null,
      }),
    });
    await reload();
  };

  const markRecurrenceOccurrence: FinanceApi['markRecurrenceOccurrence'] = (recurrenceId, month, year, amountCents, memberId, paidOnISO, shared, accountId) =>
    upsertRecurrenceTx(recurrenceId, month, year, amountCents, memberId, 'cleared', paidOnISO ?? today, shared, accountId);

  const setRecurrenceOccurrenceAmount: FinanceApi['setRecurrenceOccurrenceAmount'] = (recurrenceId, month, year, amountCents) =>
    upsertRecurrenceTx(recurrenceId, month, year, amountCents, null, 'pending');

  const unmarkRecurrenceOccurrence: FinanceApi['unmarkRecurrenceOccurrence'] = async (recurrenceId, month, year) => {
    const wid = requireWallet();
    await apiFetch('/actions', {
      method: 'POST',
      body: JSON.stringify({ resource: 'occurrence', walletId: wid, recurrenceId, month, year, action: 'unmark' }),
    });
    await reload();
  };

  // --- investimentos ------------------------------------
  const addInvestment: FinanceApi['addInvestment'] = async (i) => {
    const wid = requireWallet();
    await apiFetch('/crud', {
      method: 'POST',
      body: JSON.stringify({
        resource: 'investment', walletId: wid, description: i.description, amountCents: i.amountCents,
        yieldRateBps: i.yieldRateBps, dateISO: i.dateISO, memberId: i.memberId ?? null,
      }),
    });
    await reload();
  };

  const updateInvestment: FinanceApi['updateInvestment'] = async (id, patch) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'PATCH', body: JSON.stringify({ resource: 'investment', walletId: wid, id, ...patch }) });
    await reload();
  };

  const deleteInvestment: FinanceApi['deleteInvestment'] = async (id) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'DELETE', body: JSON.stringify({ resource: 'investment', walletId: wid, id }) });
    await reload();
  };

  const updateSettings: FinanceApi['updateSettings'] = async (patch) => {
    const wid = requireWallet();
    await apiFetch('/crud', { method: 'PATCH', body: JSON.stringify({ resource: 'settings', walletId: wid, ...patch }) });
    setSettings((s) => (s ? { ...s, ...patch } : s));
  };

  const lockPeriod: FinanceApi['lockPeriod'] = async (month, year) => {
    const wid = requireWallet();
    await apiFetch('/actions', { method: 'POST', body: JSON.stringify({ resource: 'period', walletId: wid, month, year, action: 'lock' }) });
    await reload();
  };

  const unlockPeriod: FinanceApi['unlockPeriod'] = async (month, year) => {
    const wid = requireWallet();
    await apiFetch('/actions', { method: 'POST', body: JSON.stringify({ resource: 'period', walletId: wid, month, year, action: 'unlock' }) });
    await reload();
  };

  // --- seletores (finos; a lógica pura vive em `@/core`) --------------
  const spendingAccountsMemo = useMemo(() => core.spendingAccounts(data), [data]);
  const cardsMemo = useMemo(() => core.cards(data), [data]);
  const activeCategoriesMemo = useMemo(() => categories.filter((c) => !c.archived), [categories]);

  const categoryName = useCallback((id?: UUID | null) => categories.find((c) => c.id === id)?.name ?? '—', [categories]);
  const memberName = useCallback((id?: UUID | null) => members.find((m) => m.userId === id)?.profile?.name ?? '—', [members]);
  const accountName = useCallback((id?: UUID | null) => accounts.find((a) => a.id === id)?.name ?? '—', [accounts]);

  const accountBalanceCents = useCallback(
    (accountId: UUID, uptoISO?: string) => core.accountBalanceCents(data, accountId, uptoISO), [data],
  );
  const cashBalanceCents = useCallback((uptoISO?: string) => core.cashBalanceCents(data, uptoISO), [data]);
  const cardCommittedCents = useCallback((cardId: UUID) => core.cardCommittedCents(data, cardId), [data]);
  const cardAvailableCents = useCallback((cardId: UUID) => core.cardAvailableCents(data, cardId), [data]);

  const invoiceView = useCallback(
    (cardId: UUID, month: number, year: number): InvoiceView => core.computeInvoiceView(data, cardId, month, year), [data],
  );
  const monthTransactionsByDate = useCallback(
    (month: number, year: number) => core.monthTxByDate(transactions, month, year), [transactions],
  );
  const monthTransactionsByRef = useCallback(
    (month: number, year: number) => core.monthTxByRef(transactions, month, year), [transactions],
  );
  const recurrenceOccurrences = useCallback(
    (month: number, year: number): OccurrenceView[] => core.recurrenceOccurrences(data, month, year), [data],
  );
  const spendByMember = useCallback(
    (month: number, year: number): MemberSpend[] => core.spendByMember(data, month, year), [data],
  );
  const jointSpendCents = useCallback(
    (month: number, year: number) => core.jointSpendCents(data, month, year), [data],
  );
  const isPeriodLocked = useCallback(
    (month: number, year: number) => core.isPeriodLocked(periodLocks, month, year), [periodLocks],
  );
  const wouldOverdraw = useCallback(
    (accountId: UUID, amountCents: number) => core.wouldOverdraw(data, accountId, amountCents), [data],
  );
  const wouldExceedLimit = useCallback(
    (cardId: UUID, amountCents: number) => core.wouldExceedLimit(data, cardId, amountCents), [data],
  );
  const monthSummary = useCallback(
    (month: number, year: number): MonthSummary => core.monthSummary(data, month, year), [data],
  );
  const totalInvestedCents = useCallback(() => core.totalInvestedCents(data), [data]);
  const investmentMonthlyYieldCents = useCallback(() => core.investmentMonthlyYieldCents(data), [data]);
  const memberBalances = useCallback((): MemberBalance[] => core.memberBalances(data), [data]);
  const settlements = useCallback((): Settlement[] => core.settlements(data), [data]);

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
    spendByMember, jointSpendCents, isPeriodLocked, wouldOverdraw, wouldExceedLimit,
    totalInvestedCents, investmentMonthlyYieldCents, memberBalances, settlements,
    updateProfile, updateOnboarding, createWallet, renameWallet, deleteWallet, addMemberByEmail, removeMember,
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
