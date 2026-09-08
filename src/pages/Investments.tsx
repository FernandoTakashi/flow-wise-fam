import { useMemo, useState } from 'react';
import { useFinance, type NewInvestment } from '@/contexts/FinanceContext';
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
import { useToast } from '@/hooks/use-toast';
import { formatBRL, formatPct, pctToBps, bpsToPct } from '@/lib/money';
import { formatFullDate, todayISO } from '@/lib/dates';
import type { Investment } from '@/types';
import { Plus, Pencil, Trash2, PiggyBank, TrendingUp, Target } from 'lucide-react';

interface FormState { description: string; amountCents: number; ratePct: string; memberId: string; dateISO: string; }
const emptyForm = (): FormState => ({ description: '', amountCents: 0, ratePct: '', memberId: '', dateISO: todayISO() });

export default function Investments() {
  const {
    loading, investments, settings, members, memberName, userId,
    totalInvestedCents, investmentMonthlyYieldCents,
    addInvestment, updateInvestment, deleteInvestment,
  } = useFinance();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editing, setEditing] = useState<Investment | null>(null);
  const [busy, setBusy] = useState(false);

  const weightedRateBps = useMemo(() => {
    const base = investments.reduce((s, i) => s + i.amountCents, 0);
    if (base === 0) return 0;
    const w = investments.reduce((s, i) => s + i.amountCents * i.yieldRateBps, 0);
    return Math.round(w / base);
  }, [investments]);

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;

  const reset = () => { setForm(emptyForm()); setEditing(null); setShowForm(false); };
  const openEdit = (i: Investment) => {
    setEditing(i);
    setForm({
      description: i.description, amountCents: i.amountCents,
      ratePct: bpsToPct(i.yieldRateBps) ? String(bpsToPct(i.yieldRateBps)).replace('.', ',') : '',
      memberId: i.memberId ?? '', dateISO: i.date,
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || form.amountCents <= 0) {
      toast({ title: 'Preencha descrição e valor', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const payload: NewInvestment = {
      description: form.description, amountCents: form.amountCents,
      yieldRateBps: pctToBps(form.ratePct), dateISO: form.dateISO, memberId: form.memberId || null,
    };
    try {
      if (editing) { await updateInvestment(editing.id, payload); toast({ title: 'Aplicação atualizada' }); }
      else { await addInvestment(payload); toast({ title: 'Aplicação registrada' }); }
      reset();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Investimentos"
        subtitle="Carteira de ativos e rendimento"
        action={<Button onClick={() => { setEditing(null); setForm(emptyForm()); setShowForm(true); }}><Plus className="mr-2 h-4 w-4" /> Nova aplicação</Button>}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="border-l-4 border-l-primary bg-primary/5">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-primary">Total acumulado</p>
              <p className="text-2xl font-bold tabular-nums">{formatBRL(totalInvestedCents())}</p>
              {(settings?.initialInvestmentCents ?? 0) > 0 && (
                <p className="text-[11px] text-muted-foreground">inclui aporte inicial de {formatBRL(settings!.initialInvestmentCents)}</p>
              )}
            </div>
            <PiggyBank className="h-8 w-8 text-primary/40" />
          </CardContent>
        </Card>
        <Card><CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-4 w-4" /><span className="text-xs font-medium">Rendimento / mês</span></div>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{formatBRL(investmentMonthlyYieldCents())}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground"><Target className="h-4 w-4" /><span className="text-xs font-medium">Rentabilidade média</span></div>
          <p className="text-xl font-bold tabular-nums">{formatPct(weightedRateBps)} <span className="text-xs font-normal text-muted-foreground">a.m.</span></p>
        </CardContent></Card>
      </div>

      {investments.length === 0 ? (
        <EmptyState icon={<PiggyBank className="h-10 w-10" />} title="Nenhuma aplicação registrada"
          hint="Cadastre CDBs, fundos, ações — com a taxa mensal de cada um." />
      ) : (
        <div className="space-y-2">
          {investments.map((i) => (
            <Card key={i.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{i.description}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span>{formatFullDate(i.date)}</span>
                    {i.memberId && <><span>·</span><span>{memberName(i.memberId).split(' ')[0]}</span></>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{formatPct(i.yieldRateBps)} a.m.</Badge>
                  <span className="text-sm font-bold tabular-nums text-primary">{formatBRL(i.amountCents)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(i)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <ConfirmDialog
                    title="Excluir aplicação?" confirmLabel="Excluir"
                    onConfirm={() => deleteInvestment(i.id)}
                    trigger={<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : reset())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Editar aplicação' : 'Nova aplicação'}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Ativo / descrição</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex: CDB Nubank, MXRF11" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor</Label>
                <MoneyInput valueCents={form.amountCents} onChangeCents={(c) => setForm((f) => ({ ...f, amountCents: c }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Taxa (% a.m.)</Label>
                <Input inputMode="decimal" value={form.ratePct} onChange={(e) => setForm((f) => ({ ...f, ratePct: e.target.value }))} placeholder="0,00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select value={form.memberId} onValueChange={(v) => setForm((f) => ({ ...f, memberId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.profile?.name ?? '—'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={form.dateISO} onChange={(e) => setForm((f) => ({ ...f, dateISO: e.target.value }))} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={reset}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar' : 'Registrar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
