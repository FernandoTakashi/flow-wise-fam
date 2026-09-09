import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFinance } from '@/contexts/FinanceContext';
import { supabase } from '@/lib/supabase';
import { PageHeader, EmptyState } from '@/components/PageHeader';
import { MoneyInput } from '@/components/MoneyInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { formatBRL, pctToBps, bpsToPct } from '@/lib/money';
import { MONTHS_PT } from '@/lib/dates';
import type { Account, Category, CategoryKind } from '@/types';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Pencil, Check, X, Lock, LockOpen, Copy, Send, CheckCircle2 } from 'lucide-react';

const TABS = ['perfil', 'carteiras', 'contas', 'categorias', 'membros', 'períodos', 'integrações'] as const;
type Tab = typeof TABS[number];

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'perfil';
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });

  return (
    <div className="space-y-5">
      <PageHeader title="Ajustes" subtitle="Perfil, carteiras, contas, categorias e membros" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 self-start rounded-[12px] bg-[#F1E8E1] p-1">
          {TABS.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="h-[34px] rounded-[9px] px-[15px] text-[13.5px] font-semibold capitalize text-[#5C4C45] data-[state=active]:bg-ink data-[state=active]:font-bold data-[state=active]:text-on-ink data-[state=active]:shadow-none"
            >
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="perfil" className="mt-4"><ProfileTab /></TabsContent>
        <TabsContent value="carteiras" className="mt-4"><WalletsTab /></TabsContent>
        <TabsContent value="contas" className="mt-4"><AccountsTab /></TabsContent>
        <TabsContent value="categorias" className="mt-4"><CategoriesTab /></TabsContent>
        <TabsContent value="membros" className="mt-4"><MembersTab /></TabsContent>
        <TabsContent value="períodos" className="mt-4"><PeriodsTab /></TabsContent>
        <TabsContent value="integrações" className="mt-4"><IntegrationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// --- Perfil ---------------------------------------------------------------
function ProfileTab() {
  const { profile, settings, updateProfile, updateSettings } = useFinance();
  const { toast } = useToast();
  const [name, setName] = useState(profile?.name ?? '');
  const [initialInv, setInitialInv] = useState(settings?.initialInvestmentCents ?? 0);
  const [yieldPct, setYieldPct] = useState(bpsToPct(settings?.defaultYieldBps ?? 0));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ name });
      await updateSettings({ initialInvestmentCents: initialInv, defaultYieldBps: pctToBps(yieldPct) });
      toast({ title: 'Salvo' });
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Card><CardContent className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label>Nome</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>E-mail</Label>
        <Input value={profile?.email ?? ''} disabled />
      </div>
      <div className="grid grid-cols-2 gap-3 border-t pt-4">
        <div className="space-y-1.5">
          <Label>Aporte inicial (investimentos)</Label>
          <MoneyInput valueCents={initialInv} onChangeCents={setInitialInv} />
        </div>
        <div className="space-y-1.5">
          <Label>Rendimento padrão (% a.m.)</Label>
          <Input inputMode="decimal" value={String(yieldPct).replace('.', ',')}
            onChange={(e) => setYieldPct(parseFloat(e.target.value.replace(',', '.')) || 0)} />
        </div>
      </div>
      <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
    </CardContent></Card>
  );
}

// --- Carteiras -----------------------------------------------------------
function WalletsTab() {
  const { wallets, walletId, wallet, role, createWallet, renameWallet, deleteWallet, setWallet } = useFinance();
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const [rename, setRename] = useState(wallet?.name ?? '');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ title: ok }); }
    catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card><CardHeader className="p-4 pb-2"><CardTitle className="text-base">Carteira atual</CardTitle></CardHeader>
        <CardContent className="space-y-3 p-4 pt-2">
          <div className="flex gap-2">
            <Input value={rename} onChange={(e) => setRename(e.target.value)} placeholder={wallet?.name} />
            <Button variant="outline" disabled={busy || role !== 'owner' || !rename}
              onClick={() => walletId && run(() => renameWallet(walletId, rename), 'Renomeada')}>Renomear</Button>
          </div>
          {role !== 'owner' && <p className="text-xs text-muted-foreground">Só o dono pode renomear ou excluir.</p>}
          {wallets.length > 1 && role === 'owner' && (
            <ConfirmDialog
              title={`Excluir "${wallet?.name}"?`}
              description="Todos os lançamentos, contas e categorias desta carteira serão apagados."
              confirmLabel="Excluir carteira"
              onConfirm={() => walletId && deleteWallet(walletId)}
              trigger={<Button variant="outline" className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir carteira</Button>}
            />
          )}
        </CardContent>
      </Card>

      <Card><CardHeader className="p-4 pb-2"><CardTitle className="text-base">Suas carteiras</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-4 pt-2">
          {wallets.map((w) => (
            <button key={w.id} onClick={() => setWallet(w.id)}
              className={`flex w-full items-center justify-between rounded-md border p-3 text-sm ${w.id === walletId ? 'border-primary bg-primary/5' : ''}`}>
              <span className="font-medium">{w.name}</span>
              {w.id === walletId && <Badge>atual</Badge>}
            </button>
          ))}
          <div className="flex gap-2 border-t pt-3">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da nova carteira" />
            <Button disabled={busy || !newName}
              onClick={() => run(async () => { await createWallet(newName); setNewName(''); }, 'Carteira criada')}>
              <Plus className="mr-2 h-4 w-4" /> Criar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Contas ------------------------------------------------------------
function AccountsTab() {
  const { accounts, accountBalanceCents, addAccount, updateAccount, deleteAccount } = useFinance();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'cash' | 'checking'>('checking');
  const [opening, setOpening] = useState(0);
  const [busy, setBusy] = useState(false);
  const nonCard = accounts.filter((a) => a.kind !== 'card');

  const add = async () => {
    if (!name) return;
    setBusy(true);
    try {
      await addAccount({ name, kind, openingBalanceCents: opening });
      setName(''); setOpening(0);
      toast({ title: 'Conta criada' });
    } catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card><CardHeader className="p-4 pb-2"><CardTitle className="text-base">Contas de dinheiro</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-4 pt-2">
          {nonCard.map((a) => (
            <AccountRow key={a.id} account={a} balance={accountBalanceCents(a.id)}
              onSave={(patch) => updateAccount(a.id, patch)} onDelete={() => deleteAccount(a.id)} />
          ))}
          <div className="grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-4">
            <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
            <Select value={kind} onValueChange={(v) => setKind(v as 'cash' | 'checking')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Conta corrente</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <MoneyInput valueCents={opening} onChangeCents={setOpening} placeholder="Saldo inicial" />
            </div>
          </div>
          <Button onClick={add} disabled={busy || !name}><Plus className="mr-2 h-4 w-4" /> Adicionar conta</Button>
          <p className="text-[11px] text-muted-foreground">Cartões de crédito são gerenciados na aba Cartões.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountRow({ account, balance, onSave, onDelete }: {
  account: Account; balance: number;
  onSave: (patch: { name?: string; openingBalanceCents?: number }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(account.name);
  const [opening, setOpening] = useState(account.openingBalanceCents);

  const save = async () => {
    try { await onSave({ name, openingBalanceCents: opening }); setEdit(false); toast({ title: 'Conta atualizada' }); }
    catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
  };

  if (edit) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-40" />
        <div className="w-32"><MoneyInput valueCents={opening} onChangeCents={setOpening} /></div>
        <Button size="icon" className="h-8 w-8" onClick={save}><Check className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(false)}><X className="h-4 w-4" /></Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-md border p-3 text-sm">
      <div>
        <div className="font-medium">{account.name} <span className="text-[11px] font-normal text-muted-foreground">· {account.kind === 'cash' ? 'dinheiro' : 'conta corrente'}</span></div>
        <div className="text-[11px] text-muted-foreground">saldo atual {formatBRL(balance)} · inicial {formatBRL(account.openingBalanceCents)}</div>
      </div>
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" /></Button>
        <ConfirmDialog title="Excluir conta?" description="Só funciona se não houver lançamentos nela."
          confirmLabel="Excluir" onConfirm={onDelete}
          trigger={<Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>} />
      </div>
    </div>
  );
}

// --- Categorias -----------------------------------------------------
function CategoriesTab() {
  const { categories, addCategory, updateCategory, deleteCategory } = useFinance();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');

  const add = async () => {
    if (!name) return;
    try { await addCategory({ name, kind }); setName(''); toast({ title: 'Categoria criada' }); }
    catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
  };

  const groups: { key: CategoryKind; label: string }[] = [
    { key: 'expense', label: 'Saídas' }, { key: 'income', label: 'Entradas' },
  ];

  return (
    <Card><CardContent className="space-y-4 p-4">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{g.label}</p>
          <div className="flex flex-wrap gap-2">
            {categories.filter((c) => c.kind === g.key && !c.archived).map((c) => (
              <CategoryChip key={c.id} category={c}
                onRename={(n) => updateCategory(c.id, { name: n })}
                onDelete={() => deleteCategory(c.id)} />
            ))}
            {categories.filter((c) => c.kind === g.key && !c.archived).length === 0 && (
              <span className="text-xs text-muted-foreground">Nenhuma.</span>
            )}
          </div>
        </div>
      ))}
      <div className="flex gap-2 border-t pt-4">
        <Input placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">Saída</SelectItem>
            <SelectItem value="income">Entrada</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={!name}><Plus className="h-4 w-4" /></Button>
      </div>
    </CardContent></Card>
  );
}

function CategoryChip({ category, onRename, onDelete }: {
  category: Category; onRename: (n: string) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(category.name);

  if (edit) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1">
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-24 bg-transparent text-xs outline-none" autoFocus />
        <button onClick={async () => { try { await onRename(name); setEdit(false); } catch (e) { toast({ title: 'Erro', description: (e as Error).message, variant: 'destructive' }); } }}>
          <Check className="h-3 w-3 text-emerald-600" />
        </button>
        <button onClick={() => { setName(category.name); setEdit(false); }}><X className="h-3 w-3" /></button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
      {category.name}
      <button onClick={() => setEdit(true)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
      <ConfirmDialog title={`Excluir "${category.name}"?`}
        description="Se houver lançamentos usando ela, será apenas arquivada."
        confirmLabel="Excluir" onConfirm={onDelete}
        trigger={<button className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>} />
    </span>
  );
}

// --- Membros ------------------------------------------------------
function MembersTab() {
  const { members, role, userId, wallet, addMemberByEmail, removeMember } = useFinance();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const invite = async () => {
    if (!email) return;
    setBusy(true);
    try { await addMemberByEmail(email); setEmail(''); toast({ title: 'Membro adicionado' }); }
    catch (err) { toast({ title: 'Não foi possível', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const initials = (name?: string | null) => (name ?? '?')
    .split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

  return (
    <Card className="max-w-xl">
      <CardHeader className="p-[22px] pb-3">
        <CardTitle className="font-display text-[15.5px] font-bold">Membros</CardTitle>
        <p className="text-[12px] text-muted-foreground">Quem enxerga e lança em {wallet?.name ?? 'esta carteira'}</p>
      </CardHeader>
      <CardContent className="p-0">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3 border-t border-[#F1E8E1] px-[22px] py-[13px]">
            <div className="flex min-w-0 items-center gap-3">
              <div className={cn(
                'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                m.role === 'owner' ? 'bg-ink text-[#E4B8A9]' : 'bg-primary text-white',
              )}>
                {initials(m.profile?.name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-foreground">
                  {m.profile?.name ?? '—'} {m.userId === userId && <span className="text-[11.5px] font-normal text-muted-foreground">(você)</span>}
                </div>
                <div className="truncate text-[11.5px] text-[#7E6E66]">{m.profile?.email}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-[#F3EBE5] px-2 py-0.5 text-[11.5px] font-bold uppercase text-[#7E6E66]">
                {m.role === 'owner' ? 'Dono' : 'Membro'}
              </span>
              {role === 'owner' && m.userId !== userId && (
                <ConfirmDialog title="Remover membro?" confirmLabel="Remover"
                  onConfirm={() => removeMember(m.userId)}
                  trigger={<Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>} />
              )}
            </div>
          </div>
        ))}
        {role === 'owner' && (
          <div className="border-t border-[#F1E8E1] px-[22px] py-4">
            <div className="flex gap-2">
              <Input type="email" placeholder="e-mail de quem já tem conta" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[38px] rounded-[10px] border-[#EAE1DA] bg-[#FDFAF8]" />
              <Button onClick={invite} disabled={busy || !email}
                className="h-[38px] shrink-0 bg-ink text-on-ink hover:bg-ink-2">Convidar</Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">A pessoa precisa ter criado uma conta no app antes.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Períodos ----------------------------------------------------
function PeriodsTab() {
  const { periodLocks, role, lockPeriod, unlockPeriod, today } = useFinance();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const now = new Date(today + 'T00:00:00');
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const curLocked = periodLocks.some((l) => l.refMonth === curMonth + 1 && l.refYear === curYear);

  const months: { month: number; year: number }[] = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(curYear, curMonth - i, 1);
    months.push({ month: d.getMonth(), year: d.getFullYear() });
  }

  const toggle = async (month: number, year: number, locked: boolean) => {
    setBusy(`${year}-${month}`);
    try {
      if (locked) await unlockPeriod(month, year);
      else await lockPeriod(month, year);
      toast({ title: locked ? 'Mês reaberto' : 'Mês fechado' });
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  return (
    <div className="max-w-xl space-y-3 rounded-[18px] bg-ink p-[22px] text-on-ink">
      <h3 className="font-display text-[15.5px] font-bold capitalize text-on-ink">
        Períodos · {MONTHS_PT[curMonth]} {curYear}
      </h3>
      <p className="text-[12.5px] leading-[1.45] text-[#BCA79C]">
        Fechar um mês trava (somente leitura) todo lançamento com <strong className="text-on-ink">competência</strong> nele —
        criar, editar ou excluir passa a exigir reabrir o mês. Serve para congelar um período já conferido com o extrato.
      </p>
      {role !== 'owner' && <p className="text-[12px] text-[#F2C98A]">Só o dono da carteira pode fechar ou reabrir meses.</p>}

      {role === 'owner' && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            className="h-[38px] bg-primary text-white hover:bg-primary-dark"
            disabled={busy === `${curYear}-${curMonth}`}
            onClick={() => toggle(curMonth, curYear, curLocked)}
          >
            {curLocked
              ? <><LockOpen className="mr-1.5 h-4 w-4" /> Reabrir {MONTHS_PT[curMonth]}</>
              : <><Lock className="mr-1.5 h-4 w-4" /> Fechar {MONTHS_PT[curMonth]}</>}
          </Button>
          <Button
            variant="outline"
            className="h-[38px] border-[#4A3A33] bg-transparent text-[#E4D8D1] hover:bg-ink-2 hover:text-on-ink"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Ocultar meses' : 'Ver meses fechados'}
          </Button>
        </div>
      )}

      {showAll && (
        <div className="divide-y divide-ink-border rounded-[12px] border border-ink-border">
          {months.map(({ month, year }) => {
            const locked = periodLocks.some((l) => l.refMonth === month + 1 && l.refYear === year);
            const key = `${year}-${month}`;
            return (
              <div key={key} className="flex items-center justify-between p-3 text-[13px]">
                <span className="font-medium capitalize text-on-ink">{MONTHS_PT[month]} {year}</span>
                <div className="flex items-center gap-2">
                  {locked && (
                    <span className="rounded-full border border-[#4A3A33] px-2 py-0.5 text-[10.5px] font-bold uppercase text-[#F2C98A]">fechado</span>
                  )}
                  {role === 'owner' && (
                    <Button size="sm" variant="ghost" className="h-8 text-[#E4D8D1] hover:bg-ink-2 hover:text-on-ink"
                      disabled={busy === key} onClick={() => toggle(month, year, locked)}>
                      {locked ? <><LockOpen className="mr-1 h-3.5 w-3.5" /> Reabrir</> : <><Lock className="mr-1 h-3.5 w-3.5" /> Fechar</>}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Integrações (bot do Telegram) ------------------------------------
interface ChatLinkRow { id: string; external_id: string }

function IntegrationsTab() {
  const { userId, walletId, wallet } = useFinance();
  const { toast } = useToast();
  const botUser = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

  const [link, setLink] = useState<ChatLinkRow | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !walletId) return;
    const { data } = await supabase
      .from('chat_links')
      .select('id, external_id')
      .eq('provider', 'telegram').eq('user_id', userId).eq('wallet_id', walletId)
      .maybeSingle();
    setLink((data as ChatLinkRow) ?? null);
    setLoading(false);
  }, [userId, walletId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Enquanto houver token pendente, verifica a cada 3s se o vínculo foi criado.
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => { void refresh(); }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, refresh]);

  useEffect(() => { if (link && token) setToken(null); }, [link, token]);

  const generate = async () => {
    if (!userId || !walletId) return;
    setBusy(true);
    try {
      // 32 chars hex — bem abaixo do limite de 64 do parâmetro start do Telegram
      const t = crypto.randomUUID().replace(/-/g, '');
      const { error } = await supabase.from('chat_link_tokens').insert({
        token: t, provider: 'telegram', user_id: userId, wallet_id: walletId,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      setToken(t);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!link) return;
    setBusy(true);
    try {
      await supabase.from('chat_links').delete().eq('id', link.id);
      setLink(null);
      toast({ title: 'Telegram desconectado' });
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const deepLink = botUser && token ? `https://t.me/${botUser}?start=${token}` : null;

  return (
    <Card className="max-w-xl">
      <CardHeader className="p-[22px] pb-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#E7F2F1] text-accent">
            <Send className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="font-display text-[15.5px] font-bold">Telegram</CardTitle>
            <p className="text-[12px] text-muted-foreground">Lance gastos por mensagem, sem abrir o app</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-[22px] pt-0 text-sm">
        <p className="text-[12.5px] text-muted-foreground">
          Conecte um chat do Telegram a <strong>{wallet?.name}</strong> para lançar gastos por mensagem
          (“mercado 87,50 nubank”) e receber os lembretes das contas do dia.
        </p>

        {!botUser && (
          <div className="rounded-[12px] border border-[#F2C98A] bg-[#F3EBE5] p-3 text-[12px] text-[#5C4C45]">
            Falta definir <code>VITE_TELEGRAM_BOT_USERNAME</code> no ambiente do app (o nome do bot, sem @).
          </div>
        )}

        {loading ? (
          <div className="h-10 animate-pulse rounded-[12px] bg-muted" />
        ) : link ? (
          <div className="flex items-start justify-between gap-3 rounded-[12px] border border-[#DCEDE7] bg-[#F4F9F7] px-[14px] py-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <CheckCircle2 className="mt-px h-[19px] w-[19px] shrink-0 text-[#1F6B67]" />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#1F6B67]">
                  {botUser ? `Conectado a @${botUser}` : 'Conectado'}
                </div>
                <div className="truncate text-[11.5px] text-[#3E8B85]">Vinculado à carteira {wallet?.name}</div>
              </div>
            </div>
            <button type="button" disabled={busy} onClick={disconnect}
              className="shrink-0 text-[12.5px] font-semibold text-[#7E6E66] hover:text-foreground">
              Desconectar
            </button>
          </div>
        ) : deepLink ? (
          <div className="space-y-2">
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-[#7E6E66]">Conectar outro chat</p>
            <div className="flex gap-2">
              <Input readOnly value={deepLink}
                className="h-[38px] rounded-[10px] border-[#EAE1DA] bg-[#FDFAF8] font-mono text-[12.5px] text-[#5C4C45]"
                onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" className="h-[38px] shrink-0 bg-accent text-white hover:bg-accent/90"
                onClick={() => { void navigator.clipboard?.writeText(deepLink); toast({ title: 'Link copiado' }); }}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
            <p className="text-[11.5px] text-[#7E6E66]">
              Abra no celular com o Telegram instalado e toque em <strong>Iniciar</strong>. Expira em 10 min.
            </p>
            <p className="text-[11px] text-muted-foreground">Aguardando a confirmação do bot…</p>
          </div>
        ) : (
          <Button className="h-[38px]" disabled={busy || !botUser} onClick={generate}>
            <Send className="mr-2 h-4 w-4" /> Gerar link de conexão
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
