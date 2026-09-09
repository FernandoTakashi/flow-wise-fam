import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader, EmptyState } from '@/components/PageHeader';
import { MoneyInput } from '@/components/MoneyInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBRL, splitInstallments } from '@/lib/money';
import { formatDayMonth, isoParts, MONTHS_PT, resolveInvoiceRef } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/types';
import { Plus, Pencil, Trash2, ArrowLeftRight, Users, AlertTriangle, Lock, Search } from 'lucide-react';

type Kind = 'income' | 'expense';

interface FormState {
  kind: Kind;
  accountId: string;
  amountCents: number;
  dateISO: string;
  refMonth: number;
  refYear: number;
  refAuto: boolean;
  categoryId: string;
  memberId: string;
  description: string;
  installments: string;
  installmentStart: string;
  splitOn: boolean;
}

const emptyForm = (dateISO: string): FormState => {
  const { y, m } = isoParts(dateISO);
  return {
    kind: 'expense', accountId: '', amountCents: 0, dateISO,
    refMonth: m + 1, refYear: y, refAuto: true,
    categoryId: '', memberId: '', description: '', installments: '1', installmentStart: '1', splitOn: false,
  };
};

const COLS = 'grid-cols-[78px_minmax(0,1fr)_132px_124px_104px_122px_72px]';

export default function Transactions({ kind = 'expense', embedded = false }: { kind?: Kind; embedded?: boolean }) {
  const {
    loading, selectedMonth, today, transactions, accounts, spendingAccounts, cards, activeCategories,
    members, userId, accountName, categoryName, memberName, isPeriodLocked, wouldOverdraw, wouldExceedLimit,
    addTransaction, updateTransaction, deleteTransaction,
  } = useFinance();
  const { toast } = useToast();
  const { month, year } = selectedMonth;
  const locked = isPeriodLocked(month, year);
  const isIncome = kind === 'income';
  const mes = MONTHS_PT[month];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({ ...emptyForm(today), kind }));
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const autoOpened = useRef(false);

  const monthTx = useMemo(
    () => transactions.filter((t) => t.refMonth === month + 1 && t.refYear === year)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions, month, year],
  );
  const kindTx = useMemo(
    () => monthTx.filter((t) => (isIncome ? t.kind === 'income' : t.kind !== 'income')),
    [monthTx, isIncome],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kindTx;
    return kindTx.filter((t) =>
      (t.description ?? '').toLowerCase().includes(q)
      || accountName(t.accountId).toLowerCase().includes(q)
      || categoryName(t.categoryId).toLowerCase().includes(q));
  }, [kindTx, search, accountName, categoryName]);

  const totals = useMemo(() => {
    let income = 0; let expense = 0;
    for (const t of monthTx) {
      if (t.status !== 'cleared') continue;
      if (t.kind === 'income') income += t.amountCents;
      else if (t.kind === 'expense') expense += t.amountCents;
    }
    return { income, expense, net: income - expense };
  }, [monthTx]);

  // abre o formulário direto quando vem do botão "Lançar" da tab bar mobile (/lancamentos?new=1)
  useEffect(() => {
    if (autoOpened.current || searchParams.get('new') !== '1') return;
    autoOpened.current = true;
    if (!locked) {
      setForm({
        ...emptyForm(today), kind,
        accountId: spendingAccounts[0]?.id ?? accounts[0]?.id ?? '', memberId: userId ?? '',
      });
      setEditing(null);
      setShowForm(true);
    }
    searchParams.delete('new');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, locked, today, kind, spendingAccounts, accounts, userId]);

  if (loading) return <div className="h-64 animate-pulse rounded-[16px] bg-muted" />;

  const selectedAccount = accounts.find((a) => a.id === form.accountId);
  const isCard = selectedAccount?.kind === 'card';
  const nInst = isCard ? Math.max(1, parseInt(form.installments, 10) || 1) : 1;
  const categoriesForKind = activeCategories.filter((c) => c.kind === form.kind);
  const cardRef = isCard && selectedAccount ? resolveInvoiceRef(form.dateISO, selectedAccount.closingDay ?? 1) : null;
  const overdrawWarn = !editing && form.kind === 'expense' && !isCard && form.accountId && form.amountCents > 0
    && wouldOverdraw(form.accountId, form.amountCents);
  const limitWarn = !editing && form.kind === 'expense' && isCard && form.accountId && form.amountCents > 0
    && wouldExceedLimit(form.accountId, form.amountCents);

  const resetForm = () => { setForm({ ...emptyForm(today), kind }); setEditing(null); setShowForm(false); };
  const evenShares = (total: number) => {
    const ids = members.map((m) => m.userId);
    if (ids.length === 0) return [] as { memberId: string; shareCents: number }[];
    const parts = splitInstallments(total, ids.length);
    return ids.map((id, i) => ({ memberId: id, shareCents: parts[i] }));
  };
  const openNew = () => {
    setForm({ ...emptyForm(today), kind, accountId: spendingAccounts[0]?.id ?? accounts[0]?.id ?? '', memberId: userId ?? '' });
    setEditing(null); setShowForm(true);
  };
  const openEdit = (t: Transaction) => {
    setEditing(t);
    setForm({
      kind: t.kind === 'income' ? 'income' : 'expense', accountId: t.accountId, amountCents: t.amountCents,
      dateISO: t.date, refMonth: t.refMonth, refYear: t.refYear, refAuto: false,
      categoryId: t.categoryId ?? '', memberId: t.memberId ?? '', description: t.description,
      installments: '1', installmentStart: '1', splitOn: t.splits.length > 0,
    });
    setShowForm(true);
  };
  const onDateChange = (dateISO: string) => setForm((f) => {
    if (!f.refAuto) return { ...f, dateISO };
    const { y, m } = isoParts(dateISO);
    return { ...f, dateISO, refMonth: m + 1, refYear: y };
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || form.amountCents <= 0) { toast({ title: 'Preencha conta e valor', variant: 'destructive' }); return; }
    const shared = form.kind === 'expense' && form.splitOn && members.length > 1;
    const splits = shared ? evenShares(form.amountCents) : undefined;
    setBusy(true);
    try {
      if (editing) {
        await updateTransaction(editing.id, {
          accountId: form.accountId, amountCents: form.amountCents, dateISO: form.dateISO,
          refMonth: form.refMonth, refYear: form.refYear,
          categoryId: form.categoryId || null, memberId: form.memberId || null,
          description: form.description, splits: shared ? splits : [],
        });
        toast({ title: 'Lançamento atualizado' });
      } else {
        await addTransaction({
          kind: form.kind, accountId: form.accountId, amountCents: form.amountCents, dateISO: form.dateISO,
          refMonth: form.refAuto ? undefined : form.refMonth, refYear: form.refAuto ? undefined : form.refYear,
          categoryId: form.categoryId || null, memberId: form.memberId || null, description: form.description,
          installments: nInst, installmentStart: parseInt(form.installmentStart, 10) || 1, splits,
        });
        toast({ title: 'Lançamento registrado' });
      }
      resetForm();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const newLabel = isIncome ? 'Nova receita' : 'Novo lançamento';

  return (
    <div className="space-y-4">
      {!embedded && <PageHeader title={isIncome ? 'Receitas' : 'Lançamentos'} subtitle={`Competência de ${mes} de ${year}`} extra={locked ? <LockPill /> : undefined} />}

      {locked && !embedded && (
        <div className="flex items-center gap-2 rounded-[12px] border border-[#F2C98A] bg-[#F3EBE5] p-3 text-[12.5px] text-[#5C4C45]">
          <Lock className="h-4 w-4 shrink-0 text-[#8A6A57]" /> Mês fechado — lançamentos com competência aqui não podem ser criados ou editados. Reabra em Ajustes › Períodos.
        </div>
      )}

      {/* tiles */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3">
        <Tile label={`Saídas de ${mes}`} value={formatBRL(totals.expense)} valueClass="text-[#C8452F]" />
        <Tile label={`Entradas de ${mes}`} value={formatBRL(totals.income)} valueClass="text-[#1F7A52]" />
        <Tile
          label="Resultado do mês"
          value={formatBRL(totals.net)}
          dark
          valueClass={totals.net >= 0 ? 'text-pos' : 'text-neg'}
        />
      </div>

      {/* barra de ferramentas */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-[#A9968C]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição, conta ou categoria"
            className="h-10 w-full rounded-[11px] border border-border bg-card pl-10 pr-3 text-[13.5px] text-foreground outline-none placeholder:text-[#A9968C] focus:border-primary"
          />
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="mr-2 h-4 w-4" /> {newLabel}</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight className="h-10 w-10" />}
          title={search ? 'Nada encontrado' : isIncome ? 'Nenhuma entrada neste mês' : 'Nenhuma saída neste mês'}
          hint={search ? 'Tente outro termo.' : isIncome ? 'Registre salário, freelas, reembolsos…' : 'Registre compras, contas, pagamentos…'} />
      ) : (
        <>
          {/* tabela desktop */}
          <div className="hidden overflow-hidden rounded-[16px] border border-border bg-card md:block">
            <div className={cn('grid gap-3 border-b border-border bg-[#FDFAF8] px-[22px] py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#7E6E66]', COLS)}>
              <span>Data</span><span>Descrição</span><span>Conta</span><span>Categoria</span><span>Quem</span>
              <span className="text-right">Valor</span><span />
            </div>
            {rows.map((t) => {
              const desc = t.description || (t.kind === 'transfer' ? 'Transferência' : categoryName(t.categoryId));
              const dot = t.kind === 'income' ? 'bg-[#2A8F63]' : t.kind === 'expense' ? 'bg-primary' : 'bg-[#C6B4AA]';
              const valClass = t.kind === 'income' ? 'text-[#1F7A52]' : t.kind === 'expense' ? 'text-foreground' : 'text-[#7E6E66]';
              const sign = t.kind === 'income' ? '+' : t.kind === 'expense' ? '−' : '';
              return (
                <div key={t.id} className={cn('group grid items-center gap-3 border-b border-[#F4EDE7] px-[22px] py-[13px] transition-colors last:border-0 hover:bg-[#FDFAF8]', COLS, t.status === 'pending' && 'opacity-[.62]')}>
                  <span className="text-[13px] tabular-nums text-[#5C4C45]">{formatDayMonth(t.date)}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <i className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                    <span className="truncate text-[14px] font-semibold text-foreground">{desc}</span>
                    {t.installmentOf && t.installmentOf > 1 && (
                      <span className="shrink-0 rounded-full border border-[#E2D7CF] px-1.5 py-px text-[10.5px] font-bold text-[#7E6E66]">{t.installmentNo}/{t.installmentOf}</span>
                    )}
                    {t.splits.length > 0 && <Users className="h-[15px] w-[15px] shrink-0 text-accent" />}
                    {t.status === 'pending' && (
                      <span className="shrink-0 rounded-full bg-[#F4EDE7] px-1.5 py-px text-[10.5px] font-bold text-[#8A6A57]">conta chegou</span>
                    )}
                  </span>
                  <span className="truncate text-[12.5px] text-[#5C4C45]">{accountName(t.accountId)}</span>
                  <span className="truncate text-[12.5px] text-[#5C4C45]">{t.categoryId ? categoryName(t.categoryId) : '—'}</span>
                  <span className="truncate text-[12.5px] text-[#5C4C45]">{t.memberId ? memberName(t.memberId).split(' ')[0] : '—'}</span>
                  <span className={cn('text-right text-[14px] font-bold tabular-nums', valClass)}>{sign}{formatBRL(t.amountCents)}</span>
                  <span className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {t.kind !== 'transfer' && (
                      <button type="button" onClick={() => openEdit(t)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <ConfirmDialog
                      title={t.kind === 'transfer' ? 'Estornar pagamento de fatura?' : 'Excluir lançamento?'}
                      description={t.kind === 'transfer' ? 'A fatura volta a ficar em aberto.' : 'Essa ação não pode ser desfeita.'}
                      confirmLabel={t.kind === 'transfer' ? 'Estornar' : 'Excluir'}
                      onConfirm={() => deleteTransaction(t.id)}
                      trigger={<button type="button" className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                    />
                  </span>
                </div>
              );
            })}
            <div className="px-[22px] py-3.5 text-[12.5px] text-[#7E6E66]">
              Competência de {mes} · {rows.length} de {kindTx.length} lançamentos
            </div>
          </div>

          {/* card-list mobile */}
          <div className="space-y-2 md:hidden">
            {rows.map((t) => {
              const desc = t.description || (t.kind === 'transfer' ? 'Transferência' : categoryName(t.categoryId));
              const dot = t.kind === 'income' ? 'bg-[#2A8F63]' : t.kind === 'expense' ? 'bg-primary' : 'bg-[#C6B4AA]';
              const valClass = t.kind === 'income' ? 'text-[#1F7A52]' : t.kind === 'expense' ? 'text-foreground' : 'text-[#7E6E66]';
              const sign = t.kind === 'income' ? '+' : t.kind === 'expense' ? '−' : '';
              return (
                <div key={t.id} className={cn('rounded-[14px] border border-border bg-card p-3.5', t.status === 'pending' && 'opacity-[.62]')}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <i className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                      <span className="truncate text-[14px] font-semibold text-foreground">{desc}</span>
                    </span>
                    <span className={cn('shrink-0 text-[14px] font-bold tabular-nums', valClass)}>{sign}{formatBRL(t.amountCents)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[#7E6E66]">
                    <span>{formatDayMonth(t.date)}</span><span>·</span><span>{accountName(t.accountId)}</span>
                    {t.categoryId && <><span>·</span><span>{categoryName(t.categoryId)}</span></>}
                    {t.memberId && <><span>·</span><span>{memberName(t.memberId).split(' ')[0]}</span></>}
                    {t.installmentOf && t.installmentOf > 1 && <span>· {t.installmentNo}/{t.installmentOf}</span>}
                    {t.splits.length > 0 && <Users className="h-3.5 w-3.5 text-accent" />}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {t.kind !== 'transfer' && (
                      <Button variant="outline" size="sm" className="h-8 flex-1" onClick={() => openEdit(t)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                      </Button>
                    )}
                    <ConfirmDialog
                      title={t.kind === 'transfer' ? 'Estornar pagamento de fatura?' : 'Excluir lançamento?'}
                      description={t.kind === 'transfer' ? 'A fatura volta a ficar em aberto.' : 'Essa ação não pode ser desfeita.'}
                      confirmLabel={t.kind === 'transfer' ? 'Estornar' : 'Excluir'}
                      onConfirm={() => deleteTransaction(t.id)}
                      trigger={<Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* dialog nova/editar */}
      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : resetForm())}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[28px] max-sm:border-x-0 max-sm:border-b-0">
          <div className="mx-auto mb-1 h-[5px] w-11 shrink-0 rounded-full bg-[#DDD1C9] sm:hidden" />
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar' : 'Nova'} {isIncome ? 'entrada' : 'saída'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor</Label>
                <MoneyInput valueCents={form.amountCents} onChangeCents={(c) => setForm((f) => ({ ...f, amountCents: c }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={form.dateISO} onChange={(e) => onDateChange(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={form.accountId} onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {spendingAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  {!isIncome && cards.map((a) => <SelectItem key={a.id} value={a.id}>Cartão · {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {cardRef && (
              <p className="rounded-[12px] bg-[#F3EBE5] p-3 text-[12px] text-[#5C4C45]">
                Compra no cartão → competência da fatura de <strong>{MONTHS_PT[cardRef.refMonth - 1]} {cardRef.refYear}</strong>.
              </p>
            )}
            {!isCard && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Competência</Label>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={form.refAuto}
                      onChange={(e) => setForm((f) => {
                        if (!e.target.checked) return { ...f, refAuto: false };
                        const { y, m } = isoParts(f.dateISO);
                        return { ...f, refAuto: true, refMonth: m + 1, refYear: y };
                      })} />
                    seguir a data
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={String(form.refMonth)} disabled={form.refAuto}
                    onValueChange={(v) => setForm((f) => ({ ...f, refMonth: parseInt(v, 10) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS_PT.map((mn, i) => <SelectItem key={i} value={String(i + 1)}>{mn}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" value={form.refYear} disabled={form.refAuto}
                    onChange={(e) => setForm((f) => ({ ...f, refYear: parseInt(e.target.value, 10) || f.refYear }))} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>{categoriesForKind.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select value={form.memberId} onValueChange={(v) => setForm((f) => ({ ...f, memberId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Quem" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.profile?.name ?? '—'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {!editing && isCard && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Total de parcelas</Label>
                    <Input type="number" min="1" max="60" value={form.installments}
                      onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))} className="text-center" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Está na parcela nº</Label>
                    <Input type="number" min="1" max={form.installments || '1'} value={form.installmentStart}
                      onChange={(e) => setForm((f) => ({ ...f, installmentStart: e.target.value }))}
                      className="text-center" disabled={nInst <= 1} />
                  </div>
                </div>
                {nInst > 1 && form.amountCents > 0 && (() => {
                  const p = splitInstallments(form.amountCents, nInst);
                  const s = Math.min(Math.max(1, parseInt(form.installmentStart, 10) || 1), nInst);
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      {nInst}× de {formatBRL(p[0])}{p[nInst - 1] !== p[0] && ` (última ${formatBRL(p[nInst - 1])})`}
                      {s > 1 && ` · lança só as parcelas ${s} a ${nInst} (${nInst - s + 1} restantes, a partir deste mês)`}
                    </p>
                  );
                })()}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="resize-none" />
            </div>

            {(overdrawWarn || limitWarn) && (
              <p className="flex items-start gap-2 rounded-[12px] bg-[#F3EBE5] p-3 text-[12px] text-[#5C4C45]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8A6A57]" />
                {overdrawWarn ? 'Isso deixa o saldo da conta negativo.' : 'Isso ultrapassa o limite do cartão.'} Você pode lançar mesmo assim.
              </p>
            )}

            {form.kind === 'expense' && members.length > 1 && (
              <label className="flex items-start gap-3 rounded-[14px] border p-3">
                <input type="checkbox" className="mt-1" checked={form.splitOn}
                  onChange={(e) => setForm((f) => ({ ...f, splitOn: e.target.checked }))} />
                <span className="text-sm">
                  <span className="flex items-center gap-1.5 font-medium"><Users className="h-4 w-4" /> Gasto compartilhado</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Divide igualmente entre os {members.length} membros da carteira — entra no acerto de contas em vez de contar tudo para uma pessoa.
                  </span>
                </span>
              </label>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar' : 'Registrar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LockPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#F2C98A] bg-[#4A3A2A]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#B35A3A]">
      <Lock className="h-3 w-3" /> mês fechado
    </span>
  );
}

function Tile({ label, value, valueClass, dark }: { label: string; value: string; valueClass?: string; dark?: boolean }) {
  return (
    <div className={cn('rounded-2xl border px-[18px] py-4', dark ? 'border-ink bg-ink' : 'border-border bg-card')}>
      <p className={cn('text-[11.5px] font-semibold', dark ? 'text-[#9C8A80]' : 'text-[#7E6E66]')}>{label}</p>
      <p className={cn('text-[22px] font-bold tabular-nums', dark ? 'text-on-ink' : 'text-foreground', valueClass)}>{value}</p>
    </div>
  );
}
