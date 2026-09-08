import { useMemo, useState } from 'react';
import { useFinance, type NewRecurrence, type OccurrenceView } from '@/contexts/FinanceContext';
import { PageHeader, EmptyState } from '@/components/PageHeader';
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
import { MONTHS_PT, todayISO } from '@/lib/dates';
import type { CategoryKind, Recurrence } from '@/types';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Check, X, Repeat, Lock, Receipt, Zap } from 'lucide-react';

interface FormState {
  description: string; kind: CategoryKind; amountCents: number;
  categoryId: string; accountId: string; day: string; startDate: string; endDate: string;
  autopay: boolean;
}
const emptyForm = (): FormState => ({
  description: '', kind: 'expense', amountCents: 0, categoryId: '', accountId: '',
  day: '5', startDate: todayISO(), endDate: '', autopay: false,
});

export default function Recurrences() {
  const {
    loading, selectedMonth, recurrenceOccurrences, spendingAccounts, cards,
    activeCategories, accountName, categoryName, userId, members, isPeriodLocked,
    addRecurrence, updateRecurrence, deleteRecurrence,
    markRecurrenceOccurrence, setRecurrenceOccurrenceAmount, unmarkRecurrenceOccurrence,
  } = useFinance();
  const { toast } = useToast();
  const { month, year } = selectedMonth;
  const locked = isPeriodLocked(month, year);

  const [tab, setTab] = useState<CategoryKind>('expense');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editing, setEditing] = useState<Recurrence | null>(null);
  const [busy, setBusy] = useState(false);

  const [mark, setMark] = useState<OccurrenceView | null>(null);
  const [markAmount, setMarkAmount] = useState(0);
  const [markPayer, setMarkPayer] = useState(userId ?? '');

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

  const reset = () => { setForm(emptyForm()); setEditing(null); setShowForm(false); };
  const openNew = () => { setForm({ ...emptyForm(), kind: tab }); setEditing(null); setShowForm(true); };
  const openEdit = (r: Recurrence) => {
    setEditing(r);
    setForm({
      description: r.description, kind: r.kind, amountCents: r.amountCents,
      categoryId: r.categoryId ?? '', accountId: r.accountId ?? '',
      day: String(r.day), startDate: r.startDate, endDate: r.endDate ?? '', autopay: r.autopay,
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || form.amountCents <= 0 || !form.day) {
      toast({ title: 'Preencha descrição, valor e dia', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const payload: NewRecurrence = {
      description: form.description, kind: form.kind, amountCents: form.amountCents,
      categoryId: form.categoryId || null, accountId: form.accountId || null,
      day: parseInt(form.day, 10), startDate: form.startDate, endDate: form.endDate || null,
      autopay: form.autopay,
    };
    try {
      if (editing) { await updateRecurrence(editing.id, payload); toast({ title: 'Recorrência atualizada' }); }
      else { await addRecurrence(payload); toast({ title: 'Recorrência criada' }); }
      reset();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const openMark = (o: OccurrenceView) => { setMark(o); setMarkAmount(o.amountCents); setMarkPayer(userId ?? ''); };
  const openInform = (o: OccurrenceView) => { setInform(o); setInformAmount(o.amountCents); };
  const confirmInform = async () => {
    if (!inform || informAmount <= 0) { toast({ title: 'Valor inválido', variant: 'destructive' }); return; }
    try {
      await setRecurrenceOccurrenceAmount(inform.recurrence.id, month, year, informAmount);
      toast({ title: 'Valor do mês registrado', description: 'Entra na projeção, mas ainda não saiu do saldo.' });
      setInform(null);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    }
  };
  const clearInform = async () => {
    if (!inform) return;
    try { await unmarkRecurrenceOccurrence(inform.recurrence.id, month, year); setInform(null); }
    catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
  };
  const confirmMark = async () => {
    if (!mark || markAmount <= 0) { toast({ title: 'Valor inválido', variant: 'destructive' }); return; }
    try {
      await markRecurrenceOccurrence(mark.recurrence.id, month, year, markAmount, markPayer || null);
      toast({ title: mark.onCard ? 'Lançado no cartão' : tab === 'income' ? 'Recebimento confirmado' : 'Pagamento confirmado' });
      setMark(null);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    }
  };
  const undo = async (recId: string) => {
    try { await unmarkRecurrenceOccurrence(recId, month, year); }
    catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
  };

  const catsForKind = activeCategories.filter((c) => c.kind === form.kind);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fixos"
        subtitle={`Recorrências de ${MONTHS_PT[month].toLowerCase()} de ${year}`}
        action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Nova recorrência</Button>}
      />

      {locked && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
          <Lock className="h-4 w-4" /> Este mês está fechado. Reabra em Ajustes › Períodos para marcar pagamentos.
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as CategoryKind)}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="expense">Saídas</TabsTrigger>
          <TabsTrigger value="income">Entradas</TabsTrigger>
        </TabsList>
      </Tabs>

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
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
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
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span>Dia {o.recurrence.day}</span>
                      {o.recurrence.accountId && <><span>·</span><span>{accountName(o.recurrence.accountId)}</span></>}
                      {o.recurrence.categoryId && <><span>·</span><span>{categoryName(o.recurrence.categoryId)}</span></>}
                      {o.recurrence.autopay && <><span>·</span><span className="inline-flex items-center gap-0.5 text-sky-600"><Zap className="h-3 w-3" /> débito automático</span></>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <div className="text-right">
                      <span className="text-sm font-bold tabular-nums">{formatBRL(done || informed ? o.amountCents : o.estimatedCents)}</span>
                      {changed && <span className="ml-1 text-[11px] text-muted-foreground line-through">{formatBRL(o.estimatedCents)}</span>}
                    </div>
                    {!done && !o.onCard && (
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px]" disabled={locked}
                        onClick={() => openInform(o)}>
                        <Receipt className="mr-1 h-3.5 w-3.5" /> {informed ? 'Editar valor' : 'Informar valor'}
                      </Button>
                    )}
                    <Button variant={done ? 'outline' : 'default'} size="sm" className="h-8" disabled={locked}
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
            <div className="space-y-2">
              <Label>Valor real {tab === 'income' ? 'recebido' : 'pago'}</Label>
              <MoneyInput valueCents={markAmount} onChangeCents={setMarkAmount} autoFocus />
              <p className="text-[11px] text-muted-foreground">Ajuste se a conta veio diferente do previsto.</p>
            </div>
            <div className="space-y-2">
              <Label>{tab === 'income' ? 'Quem recebeu' : 'Quem pagou'}</Label>
              <Select value={markPayer} onValueChange={setMarkPayer}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.profile?.name ?? '—'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMark(null)}>Cancelar</Button>
            <Button onClick={confirmMark}>Confirmar</Button>
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
              ? <Button variant="ghost" className="text-muted-foreground" onClick={clearInform}>Limpar</Button>
              : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setInform(null)}>Cancelar</Button>
              <Button onClick={confirmInform}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : reset())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Editar recorrência' : 'Nova recorrência'}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(['expense', 'income'] as CategoryKind[]).map((k) => (
                <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, kind: k, categoryId: '' }))}
                  className={`rounded-lg border p-2.5 text-sm font-medium ${form.kind === k ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-muted'}`}>
                  {k === 'income' ? 'Entrada' : 'Saída'}
                </button>
              ))}
            </div>
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
                <Input type="number" min="1" max="31" value={form.day}
                  onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Conta padrão</Label>
                <Select value={form.accountId} onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    {spendingAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    {form.kind === 'expense' && cards.map((a) => <SelectItem key={a.id} value={a.id}>💳 {a.name}</SelectItem>)}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Fim (opcional)</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Switch checked={form.autopay} onCheckedChange={(v) => setForm((f) => ({ ...f, autopay: v }))} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Débito automático</span>
                <span className="block text-[11px] text-muted-foreground">
                  Lança sozinho na data de vencimento (conta = pago; cartão = na fatura). Você só confirma o valor se vier diferente.
                </span>
              </span>
            </label>
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
