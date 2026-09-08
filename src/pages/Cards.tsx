import { useMemo, useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader, EmptyState } from '@/components/PageHeader';
import { MoneyInput } from '@/components/MoneyInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBRL } from '@/lib/money';
import { formatDayMonth, MONTHS_PT } from '@/lib/dates';
import type { Account } from '@/types';
import { CreditCard as CardIcon, Plus, Pencil, Trash2, Check, ChevronDown, ChevronUp, Lock, LockOpen } from 'lucide-react';

interface FormState { name: string; limitCents: number; closingDay: string; dueDay: string; }
const emptyForm = (): FormState => ({ name: '', limitCents: 0, closingDay: '', dueDay: '' });

const ROW_LABEL: Record<string, string> = { variavel: 'Variável', fixo: 'Fixo', previsto: 'Previsto' };

export default function Cards() {
  const {
    loading, selectedMonth, today, cards, spendingAccounts, members, userId,
    invoiceView, cardCommittedCents, cardAvailableCents,
    addAccount, updateAccount, deleteAccount, payCardInvoice, unpayCardInvoice, setInvoiceStatus,
  } = useFinance();
  const { toast } = useToast();
  const { month, year } = selectedMonth;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editing, setEditing] = useState<Account | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payDialog, setPayDialog] = useState<{ card: Account; total: number } | null>(null);
  const [payFrom, setPayFrom] = useState('');
  const [payer, setPayer] = useState(userId ?? '');

  const globals = useMemo(() => {
    let limit = 0; let committed = 0; let posted = 0; let projected = 0;
    for (const c of cards) {
      const v = invoiceView(c.id, month, year);
      limit += c.creditLimitCents ?? 0;
      committed += cardCommittedCents(c.id);
      posted += v.postedCents;
      projected += v.projectedCents;
    }
    return { limit, committed, posted, projected, available: limit - committed };
  }, [cards, cardCommittedCents, invoiceView, month, year]);

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;

  const reset = () => { setForm(emptyForm()); setEditing(null); setShowForm(false); };
  const openEdit = (c: Account) => {
    setEditing(c);
    setForm({ name: c.name, limitCents: c.creditLimitCents ?? 0, closingDay: String(c.closingDay ?? ''), dueDay: String(c.dueDay ?? '') });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.limitCents <= 0 || !form.closingDay || !form.dueDay) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateAccount(editing.id, {
          name: form.name, creditLimitCents: form.limitCents,
          closingDay: parseInt(form.closingDay, 10), dueDay: parseInt(form.dueDay, 10),
        });
        toast({ title: 'Cartão atualizado' });
      } else {
        await addAccount({
          name: form.name, kind: 'card', creditLimitCents: form.limitCents,
          closingDay: parseInt(form.closingDay, 10), dueDay: parseInt(form.dueDay, 10),
        });
        toast({ title: 'Cartão adicionado' });
      }
      reset();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const confirmPay = async () => {
    if (!payDialog || !payFrom) { toast({ title: 'Escolha a conta de origem', variant: 'destructive' }); return; }
    try {
      await payCardInvoice(payDialog.card.id, month, year, payFrom, today, payer || null);
      toast({ title: 'Fatura paga' });
      setPayDialog(null);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const toggleClose = async (invoiceId: string, status: 'open' | 'closed') => {
    try {
      await setInvoiceStatus(invoiceId, status === 'open' ? 'closed' : 'open');
      toast({ title: status === 'open' ? 'Fatura fechada' : 'Fatura reaberta' });
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cartões"
        subtitle="Limites e faturas"
        action={<Button onClick={() => { setEditing(null); setForm(emptyForm()); setShowForm(true); }}><Plus className="mr-2 h-4 w-4" /> Novo cartão</Button>}
      />

      {cards.length > 0 && (
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
            <Stat label="Limite total" value={formatBRL(globals.limit)} />
            <Stat label="Comprometido" value={formatBRL(globals.committed)} />
            <Stat label="Disponível" value={formatBRL(globals.available)} className="text-emerald-600" />
            <Stat label={`Faturas ${MONTHS_PT[month].toLowerCase()}`} value={formatBRL(globals.posted)}
              sub={globals.projected > globals.posted ? `prev. ${formatBRL(globals.projected)}` : undefined} className="text-purple-600" />
          </CardContent>
        </Card>
      )}

      {cards.length === 0 ? (
        <EmptyState icon={<CardIcon className="h-10 w-10" />} title="Nenhum cartão cadastrado"
          hint="Adicione um cartão para lançar compras parceladas e controlar faturas." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const view = invoiceView(card.id, month, year);
            const committed = cardCommittedCents(card.id);
            const available = cardAvailableCents(card.id);
            const util = card.creditLimitCents ? (committed / card.creditLimitCents) * 100 : 0;
            const isOpen = expanded === card.id;
            return (
              <Card key={card.id}>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CardIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{card.name}</CardTitle>
                        <p className="text-[11px] text-muted-foreground">Fecha dia {card.closingDay} · vence dia {card.dueDay}</p>
                      </div>
                    </div>
                    <Badge variant={view.status === 'paid' ? 'default' : 'outline'}
                      className={view.status === 'paid' ? 'bg-emerald-600' : view.status === 'closed' ? 'border-amber-300 bg-amber-50 text-amber-700' : ''}>
                      {view.status === 'paid' ? 'Paga' : view.status === 'closed' ? 'Fechada' : 'Aberta'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-2">
                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Utilizado</span>
                      <span className="font-semibold tabular-nums">{formatBRL(committed)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className={`h-full ${util > 90 ? 'bg-red-500' : util > 70 ? 'bg-orange-500' : 'bg-primary'}`}
                        style={{ width: `${Math.min(util, 100)}%` }} />
                    </div>
                    <div className="mt-1 text-right text-[11px] font-medium text-emerald-600">Disponível {formatBRL(available)}</div>
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-end justify-between border-b pb-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Fatura atual</p>
                        <p className="text-xl font-bold tabular-nums">{formatBRL(view.postedCents)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Previsão</p>
                        <p className="text-sm font-bold tabular-nums text-muted-foreground">{formatBRL(view.projectedCents)}</p>
                      </div>
                    </div>
                    {view.projectedCents > view.postedCents && (
                      <p className="pt-2 text-[11px] text-orange-600">
                        +{formatBRL(view.projectedCents - view.postedCents)} em fixos ainda não lançados
                      </p>
                    )}
                  </div>

                  <Button variant="ghost" size="sm" className="h-8 w-full justify-between bg-muted/50"
                    onClick={() => setExpanded(isOpen ? null : card.id)}>
                    Ver lançamentos ({view.rows.length})
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  {isOpen && (
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded border bg-background/50 p-1">
                      {view.rows.length === 0
                        ? <p className="p-3 text-center text-xs text-muted-foreground">Nenhum lançamento nesta fatura.</p>
                        : view.rows.map((r) => (
                          <div key={r.key} className={`flex items-center justify-between gap-2 p-2 text-xs ${r.projected ? 'text-orange-600' : ''}`}>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">{ROW_LABEL[r.type]}</Badge>
                              <span className="truncate">{r.description}</span>
                              <span className="shrink-0 text-muted-foreground">{formatDayMonth(r.dateISO)}</span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums">{formatBRL(r.amountCents)}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {view.status === 'paid' ? (
                      <ConfirmDialog
                        title="Estornar pagamento?"
                        description="A fatura volta a ficar em aberto e o lançamento de saída é removido."
                        confirmLabel="Estornar"
                        onConfirm={() => view.invoice && unpayCardInvoice(view.invoice.id)}
                        trigger={<Button size="sm" variant="outline" className="flex-1">Estornar pagamento</Button>}
                      />
                    ) : (
                      <Button size="sm" className="flex-1" disabled={view.postedCents <= 0}
                        onClick={() => { setPayDialog({ card, total: view.postedCents }); setPayFrom(spendingAccounts[0]?.id ?? ''); setPayer(userId ?? ''); }}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Pagar fatura
                      </Button>
                    )}
                    {view.invoice && view.status !== 'paid' && (
                      <Button size="sm" variant="ghost" className="h-9"
                        onClick={() => toggleClose(view.invoice!.id, view.status as 'open' | 'closed')}>
                        {view.status === 'closed' ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEdit(card)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <ConfirmDialog
                      title="Excluir cartão?"
                      description="Só é possível se não houver lançamentos nele. Caso contrário, arquive."
                      confirmLabel="Excluir"
                      onConfirm={() => deleteAccount(card.id)}
                      trigger={<Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : reset())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Editar cartão' : 'Novo cartão'}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Nubank" required />
            </div>
            <div className="space-y-1.5">
              <Label>Limite</Label>
              <MoneyInput valueCents={form.limitCents} onChangeCents={(c) => setForm((f) => ({ ...f, limitCents: c }))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dia de fechamento</Label>
                <Input type="number" min="1" max="31" value={form.closingDay}
                  onChange={(e) => setForm((f) => ({ ...f, closingDay: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Dia de vencimento</Label>
                <Input type="number" min="1" max="31" value={form.dueDay}
                  onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={reset}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar' : 'Adicionar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Pagar fatura — {payDialog?.card.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded bg-muted/50 p-2 text-center text-sm">Valor: <strong>{payDialog && formatBRL(payDialog.total)}</strong></div>
            <div className="space-y-1.5">
              <Label>Pagar com</Label>
              <Select value={payFrom} onValueChange={setPayFrom}>
                <SelectTrigger><SelectValue placeholder="Conta de origem" /></SelectTrigger>
                <SelectContent>{spendingAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quem pagou</Label>
              <Select value={payer} onValueChange={setPayer}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.profile?.name ?? '—'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancelar</Button>
            <Button onClick={confirmPay}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`text-base font-bold tabular-nums ${className ?? ''}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
