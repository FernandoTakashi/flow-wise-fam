import { useMemo, useState } from 'react';
import { useFinance, type NewRecurrence, type OccurrenceView } from '@/contexts/FinanceContext';
import { PageHeader, EmptyState } from '@/components/PageHeader';
import { OnboardingTip } from '@/components/OnboardingTip';
import { MoneyInput } from '@/components/MoneyInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { formatBRL } from '@/lib/money';
import { MONTHS_PT, todayISO, dayOfMonthISO } from '@/lib/dates';
import type { CategoryKind, Recurrence } from '@/types';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Check, X, Repeat, Lock, Receipt, Zap } from 'lucide-react';

interface FormState {
  description: string; kind: CategoryKind; amountCents: number;
  categoryId: string; accountId: string; day: string;
  autopay: boolean; variableAmount: boolean; shared: boolean;
  installmentsTotal: string; installmentsDone: string;
}
const emptyForm = (): FormState => ({
  description: '', kind: 'expense', amountCents: 0, categoryId: '', accountId: '',
  day: '5', autopay: false, variableAmount: false, shared: false,
  installmentsTotal: '', installmentsDone: '0',
});

export default function Recurrences({ kind, embedded = false }: { kind?: CategoryKind; embedded?: boolean }) {
  const {
    loading, selectedMonth, today, recurrenceOccurrences, spendingAccounts, cards,
    activeCategories, accountName, categoryName, userId, members, isPeriodLocked,
    addRecurrence, updateRecurrence, deleteRecurrence,
    markRecurrenceOccurrence, setRecurrenceOccurrenceAmount, unmarkRecurrenceOccurrence,
  } = useFinance();
  const { toast } = useToast();
  const { month, year } = selectedMonth;
  const locked = isPeriodLocked(month, year);

  const [tabState, setTab] = useState<CategoryKind>('expense');
  const tab: CategoryKind = kind ?? tabState;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editing, setEditing] = useState<Recurrence | null>(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false); // baixa/desfazer de ocorrência em andamento

  const [mark, setMark] = useState<OccurrenceView | null>(null);
  const [markAmount, setMarkAmount] = useState(0);
  const [markPayer, setMarkPayer] = useState(userId ?? '');
  const [markDate, setMarkDate] = useState(todayISO());
  const [markShared, setMarkShared] = useState(false);
  const [markAccount, setMarkAccount] = useState('');

  const [inform, setInform] = useState<OccurrenceView | null>(null);
  const [informAmount, setInformAmount] = useState(0);

  const occurrences = useMemo(
    () => recurrenceOccurrences(month, year).filter((o) => o.recurrence.kind === tab),
    [recurrenceOccurrences, month, year, tab],
  );
  const totals = useMemo(() => {
    // o.amountCents já resolve para: valor pago > valor informado do mês > previsto
    const expected = occurrences.reduce((s, o) => s + o.amountCents, 0);
    const done = occurrences.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amountCents, 0);
    const pending = occurrences.filter((o) => o.status !== 'paid').reduce((s, o) => s + o.amountCents, 0);
    return { expected, done, pending };
  }, [occurrences]);

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;

  const reset = () => { setForm({ ...emptyForm(), kind: tab }); setEditing(null); setShowForm(false); };
  const openNew = () => { setForm({ ...emptyForm(), kind: tab }); setEditing(null); setShowForm(true); };
  const openEdit = (r: Recurrence) => {
    setEditing(r);
    setForm({
      description: r.description, kind: r.kind, amountCents: r.amountCents,
      categoryId: r.categoryId ?? '', accountId: r.accountId ?? '',
      day: String(r.day), autopay: r.autopay, variableAmount: r.variableAmount, shared: r.shared,
      installmentsTotal: r.installmentsTotal ? String(r.installmentsTotal) : '',
      installmentsDone: String(r.installmentsDone ?? 0),
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || form.amountCents <= 0 || !form.day) {
      toast({ title: 'Preencha descrição, valor e dia', variant: 'destructive' });
      return;
    }
    if (form.kind === 'expense' && !form.accountId) {
      toast({ title: 'Escolha a forma de pagamento', variant: 'destructive' });
      return;
    }
    const totalParc = form.installmentsTotal ? parseInt(form.installmentsTotal, 10) : null;
    const doneParc = parseInt(form.installmentsDone, 10) || 0;
    if (totalParc != null && (totalParc < 1 || doneParc < 0 || doneParc >= totalParc)) {
      toast({ title: 'Parcelas inválidas', description: 'Parcelas já pagas tem que ser menor que o total.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const base = {
      description: form.description, kind: form.kind, amountCents: form.amountCents,
      categoryId: form.categoryId || null, accountId: form.accountId || null,
      day: parseInt(form.day, 10),
      autopay: form.kind === 'expense' && form.autopay,
      variableAmount: form.variableAmount,
      shared: form.kind === 'expense' && members.length > 1 && form.shared,
      installmentsTotal: totalParc,
      installmentsDone: totalParc != null ? doneParc : 0,
    };
    try {
      if (editing) {
        await updateRecurrence(editing.id, base);
        toast({ title: 'Recorrência atualizada' });
      } else {
        // começa a valer a partir do mês que está sendo visto
        await addRecurrence({ ...base, startDate: dayOfMonthISO(year, month, 1), endDate: null });
        toast({ title: 'Recorrência criada' });
      }
      reset();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const openMark = (o: OccurrenceView) => {
    setMark(o); setMarkAmount(o.amountCents); setMarkPayer(userId ?? ''); setMarkDate(today);
    setMarkShared(o.recurrence.shared);
    const recAcc = spendingAccounts.find((a) => a.id === o.recurrence.accountId);
    setMarkAccount(recAcc?.id ?? spendingAccounts[0]?.id ?? '');
  };
  const openInform = (o: OccurrenceView) => { setInform(o); setInformAmount(o.amountCents); };
  const runAction = async (fn: () => Promise<unknown>) => {
    if (acting) return;
    setActing(true);
    try { await fn(); }
    catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
    finally { setActing(false); }
  };
  const confirmInform = () => {
    if (!inform || informAmount <= 0) { toast({ title: 'Valor inválido', variant: 'destructive' }); return; }
    void runAction(async () => {
      await setRecurrenceOccurrenceAmount(inform.recurrence.id, month, year, informAmount);
      toast({ title: 'Valor do mês registrado', description: 'Entra na projeção, mas ainda não saiu do saldo.' });
      setInform(null);
    });
  };
  const clearInform = () => {
    if (!inform) return;
    void runAction(async () => { await unmarkRecurrenceOccurrence(inform.recurrence.id, month, year); setInform(null); });
  };
  const confirmMark = () => {
    if (!mark || markAmount <= 0) { toast({ title: 'Valor inválido', variant: 'destructive' }); return; }
    void runAction(async () => {
      await markRecurrenceOccurrence(
        mark.recurrence.id, month, year, markAmount, markPayer || null,
        markDate || undefined, markShared, mark.onCard ? undefined : markAccount || undefined,
      );
      toast({ title: mark.onCard ? 'Lançado no cartão' : tab === 'income' ? 'Recebimento confirmado' : 'Pagamento confirmado' });
      setMark(null);
    });
  };
  const undo = (recId: string) => {
    void runAction(() => unmarkRecurrenceOccurrence(recId, month, year));
  };

  const catsForKind = activeCategories.filter((c) => c.kind === form.kind);

  const newBtn = (
    <Button onClick={openNew} disabled={locked} size={embedded ? 'sm' : 'default'}>
      <Plus className="mr-2 h-4 w-4" /> {tab === 'income' ? 'Nova receita fixa' : 'Novo gasto fixo'}
    </Button>
  );

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex justify-end">{newBtn}</div>
      ) : (
        <PageHeader
          title={tab === 'income' ? 'Receitas fixas' : 'Gastos fixos'}
          subtitle={`Recorrências de ${MONTHS_PT[month].toLowerCase()} de ${year}`}
          action={newBtn}
        />
      )}

      {!embedded && (
        <OnboardingTip pageKey="fixos" title="Cadastre uma vez, baixe todo mês">
          Um fixo não lança nada sozinho — todo mês você "dá baixa" quando pagar (ou recebe). O valor pode variar mês a mês; a baixa fica marcada mesmo se você editar ou desfazer depois.
        </OnboardingTip>
      )}

      {locked && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
          <Lock className="h-4 w-4" /> Este mês está fechado. Reabra em Ajustes › Períodos para marcar pagamentos.
        </div>
      )}

      {!kind && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as CategoryKind)}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="expense">Saídas</TabsTrigger>
            <TabsTrigger value="income">Entradas</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Previsto" value={formatBRL(totals.expected)} />
        <Tile label={tab === 'income' ? 'Recebido' : 'Pago'} value={formatBRL(totals.done)} className="text-emerald-600" />
        <Tile label="Pendente" value={formatBRL(totals.pending)} className="text-red-600" />
      </div>

      {occurrences.length === 0 ? (
        <EmptyState icon={<Repeat className="h-10 w-10" />} title="Nenhuma recorrência ativa neste mês"
          hint="Cadastre salário, aluguel, assinaturas…" />
      ) : (
        <div className="space-y-2">
          {occurrences.map((o) => {
            const done = o.status === 'paid';
            const informed = o.status === 'pending';
            const changed = (done || informed) && o.amountCents !== o.estimatedCents;
            return (
              <Card key={o.recurrence.id} className={done ? 'bg-muted/30 opacity-80' : ''}>
                <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{o.recurrence.description}</span>
                      <Badge
                        variant={done ? 'default' : informed ? 'outline' : 'secondary'}
                        className={done ? 'bg-emerald-600' : informed ? 'border-amber-400 text-amber-700' : ''}>
                        {done
                          ? (tab === 'income' ? 'Recebido' : o.onCard ? 'Na fatura' : 'Pago')
                          : informed
                            ? (tab === 'income' ? 'Valor previsto' : 'Conta chegou')
                            : 'Pendente'}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        {o.recurrence.day <= 0 ? 'Último dia' : `Dia ${o.recurrence.day}`}
                      </span>
                      {o.recurrence.accountId && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10.5px] font-normal text-muted-foreground">{accountName(o.recurrence.accountId)}</Badge>
                      )}
                      {o.recurrence.categoryId && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10.5px] font-normal text-muted-foreground">{categoryName(o.recurrence.categoryId)}</Badge>
                      )}
                      {o.recurrence.variableAmount && (
                        <Badge variant="outline" className="border-amber-300 px-1.5 py-0 text-[10.5px] font-normal text-amber-700">valor variável</Badge>
                      )}
                      {o.recurrence.autopay && (
                        <Badge variant="outline" className="border-sky-300 px-1.5 py-0 text-[10.5px] font-normal text-sky-700">
                          <Zap className="mr-0.5 h-2.5 w-2.5" /> débito automático
                        </Badge>
                      )}
                    </div>
                    {o.installmentsTotal && o.installmentNo != null && (
                      <p className="mt-1 text-[11px] font-medium text-foreground">
                        Parcela {o.installmentNo}/{o.installmentsTotal}
                        {o.installmentsTotal - o.installmentNo > 0
                          && ` · faltam ${o.installmentsTotal - o.installmentNo} · devendo ≈ ${formatBRL((o.installmentsTotal - o.installmentNo + (done ? 0 : 1)) * o.amountCents)}`}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap">
                    <div className="mr-1 text-right">
                      <span className="text-sm font-bold tabular-nums">{formatBRL(done || informed ? o.amountCents : o.estimatedCents)}</span>
                      {changed && <span className="ml-1 text-[11px] text-muted-foreground line-through">{formatBRL(o.estimatedCents)}</span>}
                    </div>
                    {!done && !o.onCard && o.recurrence.variableAmount && (
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px]" disabled={locked}
                        onClick={() => openInform(o)}>
                        <Receipt className="mr-1 h-3.5 w-3.5" /> {informed ? 'Editar valor' : 'Informar valor'}
                      </Button>
                    )}
                    <Button variant={done ? 'outline' : 'default'} size="sm" className="h-8" disabled={locked || acting}
                      onClick={() => (done ? undo(o.recurrence.id) : openMark(o))}>
                      {done ? <><X className="mr-1 h-3.5 w-3.5" /> Desmarcar</> : <><Check className="mr-1 h-3.5 w-3.5" /> {o.onCard ? 'Lançar' : tab === 'income' ? 'Recebi' : 'Paguei'}</>}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(o.recurrence)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <ConfirmDialog
                      title="Excluir recorrência?"
                      description="Os lançamentos já gerados são mantidos."
                      confirmLabel="Excluir"
                      onConfirm={() => deleteRecurrence(o.recurrence.id)}
                      trigger={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!mark} onOpenChange={(o) => !o && setMark(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mark?.onCard ? 'Lançar no cartão' : tab === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {mark?.recurrence.description} · previsto {mark && formatBRL(mark.estimatedCents)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor {tab === 'income' ? 'recebido' : 'pago'}</Label>
                {mark?.recurrence.variableAmount
                  ? <MoneyInput valueCents={markAmount} onChangeCents={setMarkAmount} autoFocus />
                  : <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold tabular-nums">{formatBRL(markAmount)}</div>}
              </div>
              <div className="space-y-2">
                <Label>{tab === 'income' ? 'Data do recebimento' : 'Data da baixa'}</Label>
                <Input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {mark?.recurrence.variableAmount && 'Ajuste o valor se a conta veio diferente do previsto. '}
              {mark?.onCard && 'A data da baixa decide em qual fatura este lançamento entra.'}
            </p>
            {mark && !mark.onCard && (
              <div className="space-y-2">
                <Label>{tab === 'income' ? 'Conta que recebeu' : 'Debitar de'}</Label>
                <Select value={markAccount} onValueChange={setMarkAccount}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{spendingAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{tab === 'income' ? 'Quem recebeu' : 'Quem pagou'}</Label>
              <Select value={markPayer} onValueChange={setMarkPayer}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.profile?.name ?? '—'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {tab === 'expense' && members.length > 1 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={markShared} onChange={(e) => setMarkShared(e.target.checked)} />
                Gasto em conjunto (aparece em “em conjunto”, não no total individual)
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMark(null)} disabled={acting}>Cancelar</Button>
            <Button onClick={confirmMark} disabled={acting}>{acting ? 'Confirmando…' : 'Confirmar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!inform} onOpenChange={(o) => !o && setInform(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tab === 'income' ? 'Valor previsto do mês' : 'Valor da conta deste mês'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {inform?.recurrence.description} · previsto {inform && formatBRL(inform.estimatedCents)}
            </p>
            <div className="space-y-2">
              <Label>Valor deste mês</Label>
              <MoneyInput valueCents={informAmount} onChangeCents={setInformAmount} autoFocus />
              <p className="text-[11px] text-muted-foreground">
                Entra na projeção como {tab === 'income' ? 'a receber' : 'a pagar'}, mas não mexe no saldo até você marcar como {tab === 'income' ? 'recebido' : 'pago'}.
              </p>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            {inform?.status === 'pending'
              ? <Button variant="ghost" className="text-muted-foreground" onClick={clearInform} disabled={acting}>Limpar</Button>
              : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setInform(null)} disabled={acting}>Cancelar</Button>
              <Button onClick={confirmInform} disabled={acting}>{acting ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : reset())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar' : 'Nova'} {form.kind === 'income' ? 'receita fixa' : 'despesa fixa'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {!kind && (
              <div className="grid grid-cols-2 gap-2">
                {(['expense', 'income'] as CategoryKind[]).map((k) => (
                  <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, kind: k, categoryId: '' }))}
                    className={`rounded-lg border p-2.5 text-sm font-medium ${form.kind === k ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-muted'}`}>
                    {k === 'income' ? 'Entrada' : 'Saída'}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex: Aluguel, Salário, Netflix" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor previsto</Label>
                <MoneyInput valueCents={form.amountCents} onChangeCents={(c) => setForm((f) => ({ ...f, amountCents: c }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Dia do mês</Label>
                <Input type="number" min="1" max="31" value={form.day === '0' ? '' : form.day}
                  disabled={form.day === '0'} placeholder={form.day === '0' ? 'último dia' : ''}
                  onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} required={form.day !== '0'} />
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={form.day === '0'}
                    onChange={(e) => setForm((f) => ({ ...f, day: e.target.checked ? '0' : '5' }))} />
                  Último dia do mês (ajusta a 28/29/30/31)
                </label>
              </div>
            </div>
            {form.kind === 'expense' && (
              <div className="space-y-1.5 rounded-lg border p-3">
                <p className="text-[11px] font-medium text-muted-foreground">Parcelado / empréstimo (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total de parcelas</Label>
                    <Input type="number" min="1" max="480" placeholder="—" value={form.installmentsTotal}
                      onChange={(e) => setForm((f) => ({ ...f, installmentsTotal: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Parcelas já pagas</Label>
                    <Input type="number" min="0" value={form.installmentsDone} disabled={!form.installmentsTotal}
                      onChange={(e) => setForm((f) => ({ ...f, installmentsDone: e.target.value }))} />
                  </div>
                </div>
                {form.installmentsTotal && form.amountCents > 0 && (() => {
                  const tot = parseInt(form.installmentsTotal, 10) || 0;
                  const done = parseInt(form.installmentsDone, 10) || 0;
                  const rest = Math.max(0, tot - done);
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      Faltam {rest} parcela(s) · saldo devedor ≈ {formatBRL(rest * form.amountCents)}. Deixe vazio para recorrência sem fim.
                    </p>
                  );
                })()}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{form.kind === 'expense' ? 'Forma de pagamento' : 'Conta de recebimento'}</Label>
                <Select value={form.accountId} onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))}>
                  <SelectTrigger><SelectValue placeholder={form.kind === 'expense' ? 'Selecione' : 'Opcional'} /></SelectTrigger>
                  <SelectContent>
                    {form.kind === 'expense' && cards.map((a) => <SelectItem key={a.id} value={a.id}>Cartão · {a.name}</SelectItem>)}
                    {spendingAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {form.kind === 'expense' ? `Débito · ${a.name}` : a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>{catsForKind.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Switch checked={form.variableAmount} onCheckedChange={(v) => setForm((f) => ({ ...f, variableAmount: v }))} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Valor variável</span>
                <span className="block text-[11px] text-muted-foreground">
                  Conta que muda mês a mês (luz, água, gás). Aí você informa o valor real do mês antes de dar baixa.
                </span>
              </span>
            </label>
            {form.kind === 'expense' && (
              <label className="flex items-start gap-3 rounded-lg border p-3">
                <Switch checked={form.autopay} onCheckedChange={(v) => setForm((f) => ({ ...f, autopay: v }))} className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium">Débito automático</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Só um marcador visual — o débito sai sozinho no banco, mas você continua marcando o pagamento aqui na mão.
                  </span>
                </span>
              </label>
            )}
            {form.kind === 'expense' && members.length > 1 && (
              <label className="flex items-start gap-3 rounded-lg border p-3">
                <Switch checked={form.shared} onCheckedChange={(v) => setForm((f) => ({ ...f, shared: v }))} className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium">Gasto em conjunto</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Conta dos dois (aluguel, internet…). Ao pagar, entra em “em conjunto” no resumo, não no total individual. Não divide contas.
                  </span>
                </span>
              </label>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={reset}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar' : 'Criar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`text-base font-bold tabular-nums md:text-lg ${className ?? ''}`}>{value}</p>
    </CardContent></Card>
  );
}
