import { useMemo, useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader, EmptyState } from '@/components/PageHeader';
import { OnboardingTip } from '@/components/OnboardingTip';
import { MoneyInput } from '@/components/MoneyInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBRL } from '@/lib/money';
import { formatDayMonth, MONTHS_PT } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { Account } from '@/types';
import { CreditCard as CardIcon, Plus, Pencil, Trash2 } from 'lucide-react';

interface FormState { name: string; limitCents: number; closingDay: string; dueDay: string; }
const emptyForm = (): FormState => ({ name: '', limitCents: 0, closingDay: '', dueDay: '' });

const ROW_LABEL: Record<string, string> = { variavel: 'Variável', fixo: 'Fixo', previsto: 'Previsto' };
const PREVIEW_ROWS = 5;

export default function Cards() {
  const {
    loading, selectedMonth, today, cards, spendingAccounts, members, userId,
    invoiceView, cardCommittedCents, cardAvailableCents, isPeriodLocked,
    addAccount, updateAccount, deleteAccount, payCardInvoice, unpayCardInvoice, setInvoiceStatus,
  } = useFinance();
  const { toast } = useToast();
  const { month, year } = selectedMonth;
  const mesLower = MONTHS_PT[month].toLowerCase();
  const locked = isPeriodLocked(month, year);

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

  if (loading) return <div className="h-64 animate-pulse rounded-[18px] bg-muted" />;

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
    <div className="space-y-4">
      <PageHeader
        title="Cartões"
        subtitle="Limites e faturas"
        action={<Button onClick={() => { setEditing(null); setForm(emptyForm()); setShowForm(true); }}><Plus className="mr-2 h-4 w-4" /> Novo cartão</Button>}
      />

      <OnboardingTip pageKey="cartoes" title="O limite é travado no banco">
        Cada gasto no cartão entra na fatura do mês certo sozinho, e o app recusa lançar acima do limite disponível. Pagar a fatura aqui só move dinheiro de uma conta — não gera lançamento duplicado.
      </OnboardingTip>

      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
          <GlobalStat label="Limite total" value={formatBRL(globals.limit)} />
          <GlobalStat label="Comprometido" value={formatBRL(globals.committed)} />
          <GlobalStat label="Disponível" value={formatBRL(globals.available)} valueClass="text-[#1F7A52]" />
          <GlobalStat
            label={`Faturas de ${mesLower}`}
            value={formatBRL(globals.posted)}
            sub={globals.projected > globals.posted ? `prev. ${formatBRL(globals.projected)}` : undefined}
            valueClass="text-accent"
          />
        </div>
      )}

      {cards.length === 0 ? (
        <EmptyState icon={<CardIcon className="h-10 w-10" />} title="Nenhum cartão cadastrado"
          hint="Adicione um cartão para lançar compras parceladas e controlar faturas." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card, idx) => {
            const view = invoiceView(card.id, month, year);
            const committed = cardCommittedCents(card.id);
            const available = cardAvailableCents(card.id);
            const util = card.creditLimitCents ? (committed / card.creditLimitCents) * 100 : 0;
            const utilColor = util > 90 ? 'bg-[#C8452F]' : util > 70 ? 'bg-[#E08A3C]' : 'bg-primary';
            const showAll = expanded === card.id;
            const rows = showAll ? view.rows : view.rows.slice(0, PREVIEW_ROWS);
            const badge = view.status === 'paid'
              ? 'bg-[#1F5A3E] text-[#9FE0BE]'
              : view.status === 'closed' ? 'bg-[#4A3A2A] text-[#F2C98A]' : 'bg-[#3B2D27] text-[#E4D8D1]';
            return (
              <div key={card.id} className="overflow-hidden rounded-[18px] border border-border bg-card">
                {/* cabeçalho escuro */}
                <div className={cn('px-[22px] pb-[18px] pt-5 text-on-ink', idx % 2 ? 'bg-[#33262F]' : 'bg-ink')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-display text-[19px] font-bold text-on-ink">{card.name}</div>
                      <div className="text-[12px] text-[#9C8A80]">Fecha dia {card.closingDay} · vence dia {card.dueDay}</div>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-[5px] text-[11px] font-bold uppercase tracking-wide', badge)}>
                      {view.status === 'paid' ? 'Paga' : view.status === 'closed' ? 'Fechada' : 'Aberta'}
                    </span>
                  </div>
                  <div className="mt-[22px] flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[#9C8A80]">Fatura atual</div>
                      <div className="font-display text-[32px] font-bold leading-none tabular-nums text-on-ink">{formatBRL(view.postedCents)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[#9C8A80]">Previsão</div>
                      <div className="text-[17px] font-bold tabular-nums text-[#BCA79C]">{formatBRL(view.projectedCents)}</div>
                    </div>
                  </div>
                  {view.projectedCents > view.postedCents && (
                    <div className="mt-2 text-[12px] text-[#FFB39F]">
                      + {formatBRL(view.projectedCents - view.postedCents)} em fixos ainda não lançados
                    </div>
                  )}
                </div>

                {/* corpo */}
                <div className="space-y-3.5 px-[22px] pb-[18px] pt-4">
                  <div>
                    <div className="flex justify-between text-[12.5px]">
                      <span className="text-muted-foreground">Utilizado do limite de {formatBRL(card.creditLimitCents ?? 0)}</span>
                      <span className="font-bold tabular-nums text-foreground">{formatBRL(committed)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#F1E8E1]">
                      <div className={cn('h-full rounded-full', utilColor)} style={{ width: `${Math.min(Math.max(util, 0), 100)}%` }} />
                    </div>
                    <div className="mt-1 text-right text-[11.5px] font-semibold text-[#1F7A52]">Disponível {formatBRL(available)}</div>
                  </div>

                  <div>
                    <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-[#7E6E66]">
                      Lançamentos da fatura ({view.rows.length})
                    </div>
                    <div className="space-y-1">
                      {view.rows.length === 0 && (
                        <p className="py-3 text-center text-xs text-muted-foreground">Nenhum lançamento nesta fatura.</p>
                      )}
                      {rows.map((r) => (
                        <div key={r.key} className={cn('flex items-center gap-2 text-[12.5px]', r.projected && 'text-[#B35A3A]')}>
                          <span className={cn(
                            'w-14 shrink-0 rounded-full border px-1 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide',
                            r.projected ? 'border-[#F0C9B8]' : 'border-[#E2D7CF]',
                          )}>
                            {ROW_LABEL[r.type]}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{r.description}</span>
                          <span className="shrink-0 text-[#A9968C]">{formatDayMonth(r.dateISO)}</span>
                          <span className="shrink-0 font-bold tabular-nums">{formatBRL(r.amountCents)}</span>
                        </div>
                      ))}
                      {view.rows.length > PREVIEW_ROWS && (
                        <button
                          type="button"
                          onClick={() => setExpanded(showAll ? null : card.id)}
                          className="pt-1 text-[12px] font-semibold text-accent"
                        >
                          {showAll ? 'Ver menos' : `Ver todos (${view.rows.length})`}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {view.status === 'paid' ? (
                      <ConfirmDialog
                        title="Estornar pagamento?"
                        description="A fatura volta a ficar em aberto e o lançamento de saída é removido."
                        confirmLabel="Estornar"
                        onConfirm={() => view.invoice && unpayCardInvoice(view.invoice.id)}
                        trigger={<Button variant="outline" className="h-[38px] flex-1" disabled={locked}>Estornar pagamento</Button>}
                      />
                    ) : (
                      <Button className="h-[38px] flex-1" disabled={locked || view.postedCents <= 0}
                        onClick={() => { setPayDialog({ card, total: view.postedCents }); setPayFrom(spendingAccounts[0]?.id ?? ''); setPayer(userId ?? ''); }}>
                        Pagar fatura
                      </Button>
                    )}
                    {view.invoice && view.status !== 'paid' && (
                      <Button variant="outline" className="h-[38px]" disabled={locked}
                        onClick={() => toggleClose(view.invoice!.id, view.status as 'open' | 'closed')}>
                        {view.status === 'closed' ? 'Reabrir fatura' : 'Fechar fatura'}
                      </Button>
                    )}
                    <Button variant="outline" size="icon" className="h-[38px] w-[38px]" onClick={() => openEdit(card)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <ConfirmDialog
                      title="Excluir cartão?"
                      description="Só é possível se não houver lançamentos nele. Caso contrário, arquive."
                      confirmLabel="Excluir"
                      onConfirm={() => deleteAccount(card.id)}
                      trigger={<Button variant="ghost" size="icon" className="h-[38px] w-[38px] text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                    />
                  </div>
                </div>
              </div>
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
            <div className="rounded-lg bg-muted/50 p-2 text-center text-sm">Valor: <strong className="tabular-nums">{payDialog && formatBRL(payDialog.total)}</strong></div>
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

function GlobalStat({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-[18px] py-4">
      <p className="whitespace-nowrap text-[11.5px] font-semibold text-[#7E6E66]">{label}</p>
      <p className={cn('text-[21px] font-bold tabular-nums text-foreground', valueClass)}>{value}</p>
      {sub && <p className="text-[11px] text-[#7E6E66]">{sub}</p>}
    </div>
  );
}
