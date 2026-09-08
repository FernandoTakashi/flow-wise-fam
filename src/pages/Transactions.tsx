import { useMemo, useState } from 'react';
import { useFinance, type NewTransaction } from '@/contexts/FinanceContext';
import { PageHeader, EmptyState } from '@/components/PageHeader';
import { MoneyInput } from '@/components/MoneyInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBRL, splitInstallments } from '@/lib/money';
import { formatDayMonth, isoParts, MONTHS_PT, resolveInvoiceRef } from '@/lib/dates';
import type { Transaction } from '@/types';
import {
  Plus, Pencil, Trash2, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Users, AlertTriangle, Lock,
} from 'lucide-react';

type Kind = 'income' | 'expense';

interface FormState {
  kind: Kind;
  accountId: string;
  amountCents: number;
  dateISO: string;
  refMonth: number;   // 1-12
  refYear: number;
  refAuto: boolean;
  categoryId: string;
  memberId: string;
  description: string;
  installments: string;
  splitOn: boolean;
  shares: Record<string, number>;
}

const emptyForm = (dateISO: string): FormState => {
  const { y, m } = isoParts(dateISO);
  return {
    kind: 'expense', accountId: '', amountCents: 0, dateISO,
    refMonth: m + 1, refYear: y, refAuto: true,
    categoryId: '', memberId: '', description: '', installments: '1', splitOn: false, shares: {},
  };
};

export default function Transactions({ kind = 'expense' }: { kind?: Kind }) {
  const {
    loading, selectedMonth, today, transactions, accounts, spendingAccounts, cards, activeCategories,
    members, userId, accountName, categoryName, memberName, isPeriodLocked, wouldOverdraw, wouldExceedLimit,
    addTransaction, updateTransaction, deleteTransaction,
  } = useFinance();
  const { toast } = useToast();
  const { month, year } = selectedMonth;
  const locked = isPeriodLocked(month, year);
  const isIncome = kind === 'income';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({ ...emptyForm(today), kind }));
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);

  const monthTx = useMemo(
    () => transactions.filter((t) => t.refMonth === month + 1 && t.refYear === year)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions, month, year],
  );
  // "Saídas" = despesas + transferências (pagamento de fatura é saída de dinheiro)
  const kindTx = useMemo(
    () => monthTx.filter((t) => (isIncome ? t.kind === 'income' : t.kind !== 'income')),
    [monthTx, isIncome],
  );
  const totals = useMemo(() => {
    let income = 0; let expense = 0;
    for (const t of monthTx) {
      if (t.status !== 'cleared') continue;
      if (t.kind === 'income') income += t.amountCents;
      else if (t.kind === 'expense') expense += t.amountCents;
    }
    return { income, expense, net: income - expense };
  }, [monthTx]);

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;

  const selectedAccount = accounts.find((a) => a.id === form.accountId);
  const isCard = selectedAccount?.kind === 'card';
  const nInst = isCard ? Math.max(1, parseInt(form.installments, 10) || 1) : 1;
  const categoriesForKind = activeCategories.filter((c) => c.kind === form.kind);

  // aviso de competência real quando é cartão
  const cardRef = isCard && selectedAccount
    ? resolveInvoiceRef(form.dateISO, selectedAccount.closingDay ?? 1)
    : null;

  const overdrawWarn = !editing && form.kind === 'expense' && !isCard && form.accountId && form.amountCents > 0
    && wouldOverdraw(form.accountId, form.amountCents);
  const limitWarn = !editing && form.kind === 'expense' && isCard && form.accountId && form.amountCents > 0
    && wouldExceedLimit(form.accountId, form.amountCents);

  const resetForm = () => { setForm({ ...emptyForm(today), kind }); setEditing(null); setShowForm(false); };

  const evenShares = (total: number): Record<string, number> => {
    const ids = members.map((m) => m.userId);
    if (ids.length === 0) return {};
    const parts = splitInstallments(total, ids.length);
    return Object.fromEntries(ids.map((id, i) => [id, parts[i]]));
  };

  const openNew = () => {
    setForm({
      ...emptyForm(today), kind,
      accountId: spendingAccounts[0]?.id ?? accounts[0]?.id ?? '', memberId: userId ?? '',
    });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (t: Transaction) => {
    setEditing(t);
    setForm({
      kind: t.kind === 'income' ? 'income' : 'expense',
      accountId: t.accountId,
      amountCents: t.amountCents,
      dateISO: t.date,
      refMonth: t.refMonth,
      refYear: t.refYear,
      refAuto: false,
      categoryId: t.categoryId ?? '',
      memberId: t.memberId ?? '',
      description: t.description,
      installments: '1',
      splitOn: t.splits.length > 0,
      shares: t.splits.reduce((acc, s) => ({ ...acc, [s.memberId]: s.shareCents }), {} as Record<string, number>),
    });
    setShowForm(true);
  };

  const onDateChange = (dateISO: string) => {
    setForm((f) => {
      if (!f.refAuto) return { ...f, dateISO };
      const { y, m } = isoParts(dateISO);
      return { ...f, dateISO, refMonth: m + 1, refYear: y };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || form.amountCents <= 0) {
      toast({ title: 'Preencha conta e valor', variant: 'destructive' });
      return;
    }
    let splits: NewTransaction['splits'];
    if (form.kind === 'expense' && form.splitOn) {
      splits = members.map((m) => ({ memberId: m.userId, shareCents: form.shares[m.userId] ?? 0 }))
        .filter((s) => s.shareCents > 0);
      const sum = splits.reduce((s, x) => s + x.shareCents, 0);
      if (sum !== form.amountCents) {
        toast({ title: 'Divisão não bate', description: `Soma das partes: ${formatBRL(sum)} ≠ ${formatBRL(form.amountCents)}`, variant: 'destructive' });
        return;
      }
    }

    setBusy(true);
    try {
      if (editing) {
        await updateTransaction(editing.id, {
          accountId: form.accountId, amountCents: form.amountCents, dateISO: form.dateISO,
          refMonth: form.refMonth, refYear: form.refYear,
          categoryId: form.categoryId || null, memberId: form.memberId || null,
          description: form.description, splits: form.kind === 'expense' && form.splitOn ? splits : [],
        });
        toast({ title: 'Lançamento atualizado' });
      } else {
        await addTransaction({
          kind: form.kind, accountId: form.accountId, amountCents: form.amountCents, dateISO: form.dateISO,
          refMonth: form.refAuto ? undefined : form.refMonth, refYear: form.refAuto ? undefined : form.refYear,
          categoryId: form.categoryId || null, memberId: form.memberId || null, description: form.description,
          installments: nInst, splits,
        });
        toast({ title: 'Lançamento registrado' });
      }
      resetForm();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={isIncome ? 'Entradas' : 'Saídas'}
        subtitle={`Competência de ${MONTHS_PT[month]} de ${year}`}
        action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> {isIncome ? 'Nova entrada' : 'Nova saída'}</Button>}
      />

      {locked && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
          <Lock className="h-4 w-4" /> Mês fechado — lançamentos com competência aqui não podem ser criados ou editados. Reabra em Ajustes › Períodos.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {isIncome
          ? <MiniTile label={`Entradas de ${MONTHS_PT[month]}`} value={formatBRL(totals.income)} className="text-emerald-600" />
          : <MiniTile label={`Saídas de ${MONTHS_PT[month]}`} value={formatBRL(totals.expense)} className="text-red-600" />}
        <MiniTile label="Resultado do mês" value={formatBRL(totals.net)} className={totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'} />
      </div>

      {kindTx.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight className="h-10 w-10" />}
          title={isIncome ? 'Nenhuma entrada neste mês' : 'Nenhuma saída neste mês'}
          hint={isIncome ? 'Registre salário, freelas, reembolsos…' : 'Registre compras, contas, pagamentos…'} />
      ) : (
        <div className="space-y-2">
          {kindTx.map((t) => (
            <Card key={t.id} className={t.status === 'pending' ? 'border-dashed opacity-70' : ''}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <TxIcon kind={t.kind} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {t.description || (t.kind === 'transfer' ? 'Transferência' : categoryName(t.categoryId))}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{formatDayMonth(t.date)}</span>
                      <span>·</span>
                      <span>{accountName(t.accountId)}</span>
                      {t.categoryId && <><span>·</span><span>{categoryName(t.categoryId)}</span></>}
                      {t.memberId && <><span>·</span><span>{memberName(t.memberId).split(' ')[0]}</span></>}
                      {t.installmentOf && t.installmentOf > 1 && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px]">{t.installmentNo}/{t.installmentOf}</Badge>
                      )}
                      {t.splits.length > 0 && <Users className="h-3 w-3" />}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={`text-sm font-bold tabular-nums ${t.kind === 'income' ? 'text-emerald-600' : t.kind === 'expense' ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {t.kind === 'income' ? '+' : t.kind === 'expense' ? '−' : ''}{formatBRL(t.amountCents)}
                  </span>
                  {t.kind !== 'transfer' && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <ConfirmDialog
                        title="Excluir lançamento?"
                        description="Essa ação não pode ser desfeita."
                        confirmLabel="Excluir"
                        onConfirm={() => deleteTransaction(t.id)}
                        trigger={<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>}
                      />
                    </>
                  )}
                  {t.kind === 'transfer' && (
                    <ConfirmDialog
                      title="Estornar pagamento de fatura?"
                      description="A fatura volta a ficar em aberto."
                      confirmLabel="Estornar"
                      onConfirm={() => deleteTransaction(t.id)}
                      trigger={<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : resetForm())}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar' : 'Nova'} {isIncome ? 'entrada' : 'saída'}
            </DialogTitle>
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
                  {cards.map((a) => <SelectItem key={a.id} value={a.id}>💳 {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {cardRef && (
              <p className="rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
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
                  <SelectContent>
                    {categoriesForKind.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select value={form.memberId} onValueChange={(v) => setForm((f) => ({ ...f, memberId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Quem" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.profile?.name ?? '—'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!editing && isCard && (
              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Input type="number" min="1" max="60" value={form.installments}
                  onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))} className="w-24 text-center" />
                {nInst > 1 && form.amountCents > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {nInst}× de {formatBRL(splitInstallments(form.amountCents, nInst)[0])}
                    {splitInstallments(form.amountCents, nInst)[nInst - 1] !== splitInstallments(form.amountCents, nInst)[0]
                      && ` (última ${formatBRL(splitInstallments(form.amountCents, nInst)[nInst - 1])})`}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="resize-none" />
            </div>

            {(overdrawWarn || limitWarn) && (
              <p className="flex items-start gap-2 rounded bg-amber-50 p-2 text-[11px] text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {overdrawWarn ? 'Isso deixa o saldo da conta negativo.' : 'Isso ultrapassa o limite do cartão.'} Você pode lançar mesmo assim.
              </p>
            )}

            {form.kind === 'expense' && members.length > 1 && (
              <div className="rounded-lg border border-dashed p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={form.splitOn}
                    onChange={(e) => setForm((f) => ({
                      ...f, splitOn: e.target.checked,
                      shares: e.target.checked ? evenShares(f.amountCents) : {},
                    }))} />
                  <Users className="h-4 w-4" /> Dividir entre membros
                </label>
                {form.splitOn && (
                  <div className="mt-3 space-y-2">
                    {members.map((m) => (
                      <div key={m.userId} className="flex items-center justify-between gap-2">
                        <span className="text-sm">{m.profile?.name ?? '—'}</span>
                        <div className="w-32">
                          <MoneyInput valueCents={form.shares[m.userId] ?? 0}
                            onChangeCents={(c) => setForm((f) => ({ ...f, shares: { ...f.shares, [m.userId]: c } }))} />
                        </div>
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground">Soma deve bater com {formatBRL(form.amountCents)}.</p>
                  </div>
                )}
              </div>
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

function MiniTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className={`text-base font-bold tabular-nums md:text-lg ${className ?? ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function TxIcon({ kind }: { kind: Transaction['kind'] }) {
  const cls = 'h-8 w-8 shrink-0 rounded-full p-1.5';
  if (kind === 'income') return <ArrowUpCircle className={`${cls} bg-emerald-100 text-emerald-600`} />;
  if (kind === 'expense') return <ArrowDownCircle className={`${cls} bg-red-100 text-red-600`} />;
  return <ArrowLeftRight className={`${cls} bg-muted text-muted-foreground`} />;
}
