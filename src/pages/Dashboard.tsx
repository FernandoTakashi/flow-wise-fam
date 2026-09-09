import { useMemo, useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoneyInput } from '@/components/MoneyInput';
import { useToast } from '@/hooks/use-toast';
import { formatBRL } from '@/lib/money';
import { MONTHS_PT } from '@/lib/dates';
import { Wallet, Target, TrendingUp, TrendingDown, Check, CreditCard, Repeat, Scale, Lock } from 'lucide-react';
import type { OccurrenceView } from '@/contexts/FinanceContext';

export default function Dashboard() {
  const {
    loading, selectedMonth, today, monthSummary, cards, invoiceView, recurrenceOccurrences,
    spendingAccounts, members, memberName, userId, isPeriodLocked, spendByMember,
    payCardInvoice, markRecurrenceOccurrence, memberBalances,
  } = useFinance();
  const { toast } = useToast();
  const { month, year } = selectedMonth;
  const locked = isPeriodLocked(month, year);

  const summary = useMemo(() => monthSummary(month, year), [monthSummary, month, year]);
  const pending = useMemo(
    () => recurrenceOccurrences(month, year).filter((o) => o.status !== 'paid'),
    [recurrenceOccurrences, month, year],
  );
  // fixos de cartão não aparecem soltos: entram na linha da fatura (evita duplicar o valor)
  const pendingExpenses = useMemo(
    () => pending.filter((o) => o.recurrence.kind === 'expense' && !o.onCard),
    [pending],
  );
  const pendingIncomes = useMemo(() => pending.filter((o) => o.recurrence.kind === 'income'), [pending]);
  const openInvoices = useMemo(
    () => cards.map((c) => ({ card: c, view: invoiceView(c.id, month, year) }))
      .filter((x) => x.view.status !== 'paid' && (x.view.postedCents > 0 || x.view.projectedCents > 0)),
    [cards, invoiceView, month, year],
  );
  const balances = useMemo(() => memberBalances().filter((b) => b.netCents !== 0), [memberBalances]);
  const ranking = useMemo(() => spendByMember(month, year).filter((r) => r.totalCents > 0), [spendByMember, month, year]);
  const rankTop = ranking[0]?.totalCents ?? 0;

  const [payCard, setPayCard] = useState<{ cardId: string; total: number } | null>(null);
  const [payFrom, setPayFrom] = useState('');
  const [payer, setPayer] = useState(userId ?? '');
  const [fixo, setFixo] = useState<OccurrenceView | null>(null);
  const [fixoAmount, setFixoAmount] = useState(0);
  const [fixoPayer, setFixoPayer] = useState(userId ?? '');
  const [fixoDate, setFixoDate] = useState(today);
  const [fixoShared, setFixoShared] = useState(false);
  const [fixoAccount, setFixoAccount] = useState('');

  if (loading) return <DashboardSkeleton />;

  const confirmPayCard = async () => {
    if (!payCard || !payFrom) { toast({ title: 'Escolha a conta de origem', variant: 'destructive' }); return; }
    try {
      await payCardInvoice(payCard.cardId, month, year, payFrom, today, payer || null);
      toast({ title: 'Fatura paga', description: 'Saldo atualizado.' });
      setPayCard(null);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const confirmFixo = async () => {
    if (!fixo || fixoAmount <= 0) { toast({ title: 'Valor inválido', variant: 'destructive' }); return; }
    try {
      await markRecurrenceOccurrence(
        fixo.recurrence.id, month, year, fixoAmount, fixoPayer || null,
        fixoDate || undefined, fixoShared, fixo.onCard ? undefined : fixoAccount || undefined,
      );
      toast({ title: fixo.onCard ? 'Lançado no cartão' : 'Marcado como pago' });
      setFixo(null);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const openFixo = (o: OccurrenceView) => {
    setFixo(o); setFixoAmount(o.amountCents); setFixoPayer(userId ?? ''); setFixoDate(today);
    setFixoShared(o.recurrence.shared);
    const recAcc = spendingAccounts.find((a) => a.id === o.recurrence.accountId);
    setFixoAccount(recAcc?.id ?? spendingAccounts[0]?.id ?? '');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Competência de {MONTHS_PT[month]} de {year}</p>
        </div>
        {locked && (
          <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700">
            <Lock className="h-3 w-3" /> mês fechado
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Saldo em caixa" value={formatBRL(summary.cashBalanceCents)} hint="Hoje, regime de caixa"
          icon={<Wallet className="h-4 w-4" />} tone="emerald" />
        <Kpi label="Projeção fim do mês" value={formatBRL(summary.projectedBalanceCents)} hint="Após pendências"
          icon={<Target className="h-4 w-4" />} tone="primary" />
        <Kpi label="A receber" value={formatBRL(summary.pendingIncomeCents)} hint="Entradas previstas"
          icon={<TrendingUp className="h-4 w-4" />} tone="green" />
        <Kpi label="A pagar" value={formatBRL(summary.pendingExpenseCents)} hint="Fixos + faturas + previstos"
          icon={<TrendingDown className="h-4 w-4" />} tone="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">A pagar</CardTitle>
            <CardDescription className="text-xs">
              Fixos e faturas de {MONTHS_PT[month].toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2">
            {pendingExpenses.length === 0 && openInvoices.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nada em aberto. 🎉</p>
            )}
            {pendingExpenses.map((o) => (
              <div key={o.recurrence.id} className="flex items-center justify-between rounded-md border bg-background p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-orange-500" />
                  <div>
                    <div className="font-medium">{o.recurrence.description}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {o.recurrence.day <= 0 ? 'Vence no último dia' : `Vence dia ${o.recurrence.day}`}{o.onCard && ' · no cartão'}{o.status === 'pending' && ' · conta chegou'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatBRL(o.amountCents)}</span>
                  {o.status === 'pending' && o.amountCents !== o.estimatedCents && (
                    <span className="text-[11px] text-muted-foreground line-through">{formatBRL(o.estimatedCents)}</span>
                  )}
                  <Button size="sm" variant="outline" className="h-8" disabled={locked} onClick={() => openFixo(o)}>
                    <Check className="mr-1 h-3.5 w-3.5" /> {o.onCard ? 'Lançar' : 'Paguei'}
                  </Button>
                </div>
              </div>
            ))}
            {openInvoices.map(({ card, view }) => (
              <div key={card.id} className="flex items-center justify-between rounded-md border bg-background p-3 text-sm">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-purple-500" />
                  <div>
                    <div className="font-medium">Fatura {card.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatBRL(view.postedCents)}
                      {view.projectedCents > view.postedCents && ` · prev. ${formatBRL(view.projectedCents)}`}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-8"
                  onClick={() => { setPayCard({ cardId: card.id, total: view.postedCents }); setPayFrom(spendingAccounts[0]?.id ?? ''); setPayer(userId ?? ''); }}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Pagar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">A receber</CardTitle>
            <CardDescription className="text-xs">Entradas previstas para {MONTHS_PT[month].toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2">
            {pendingIncomes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nada previsto.</p>
            ) : pendingIncomes.map((o) => (
              <div key={o.recurrence.id} className="flex items-center justify-between rounded-md border bg-background p-3 text-sm">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <div>
                    <div className="font-medium">{o.recurrence.description}</div>
                    <div className="text-[11px] text-muted-foreground">{o.recurrence.day <= 0 ? 'Último dia' : `Dia ${o.recurrence.day}`}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-emerald-600">{formatBRL(o.amountCents)}</span>
                  <Button size="sm" variant="outline" className="h-8" disabled={locked} onClick={() => openFixo(o)}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Recebi
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {ranking.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Quem gastou mais</CardTitle>
            <CardDescription className="text-xs">Despesas com competência em {MONTHS_PT[month].toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-2">
            {ranking.map((r) => (
              <div key={r.memberId} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{memberName(r.memberId)}</span>
                  <span className="tabular-nums text-muted-foreground">{formatBRL(r.totalCents)}</span>
                </div>
                <Progress value={rankTop > 0 ? (r.totalCents / rankTop) * 100 : 0} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {balances.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4" /> Divisão entre membros</CardTitle>
            <CardDescription className="text-xs">Saldo das despesas compartilhadas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2">
            {balances.map((b) => (
              <div key={b.memberId} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span className="font-medium">{memberName(b.memberId)}</span>
                <span className={b.netCents > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                  {b.netCents > 0 ? 'tem a receber ' : 'deve '}{formatBRL(Math.abs(b.netCents))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!payCard} onOpenChange={(o) => !o && setPayCard(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Pagar fatura</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded bg-muted/50 p-2 text-center text-sm">Valor: <strong>{payCard && formatBRL(payCard.total)}</strong></div>
            <div className="space-y-2">
              <Label>Pagar com</Label>
              <Select value={payFrom} onValueChange={setPayFrom}>
                <SelectTrigger><SelectValue placeholder="Conta de origem" /></SelectTrigger>
                <SelectContent>{spendingAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quem pagou</Label>
              <Select value={payer} onValueChange={setPayer}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.profile?.name ?? '—'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayCard(null)}>Cancelar</Button>
            <Button onClick={confirmPayCard}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fixo} onOpenChange={(o) => !o && setFixo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{fixo?.recurrence.kind === 'income' ? 'Confirmar recebimento' : fixo?.onCard ? 'Lançar no cartão' : 'Confirmar pagamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {fixo?.recurrence.description} · previsto {fixo && formatBRL(fixo.estimatedCents)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor</Label>
                {fixo?.recurrence.variableAmount
                  ? <MoneyInput valueCents={fixoAmount} onChangeCents={setFixoAmount} autoFocus />
                  : <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold tabular-nums">{formatBRL(fixoAmount)}</div>}
              </div>
              <div className="space-y-2">
                <Label>{fixo?.recurrence.kind === 'income' ? 'Data' : 'Data da baixa'}</Label>
                <Input type="date" value={fixoDate} onChange={(e) => setFixoDate(e.target.value)} />
              </div>
            </div>
            {fixo?.onCard && (
              <p className="text-[11px] text-muted-foreground">A data da baixa decide em qual fatura o lançamento entra.</p>
            )}
            {fixo && !fixo.onCard && (
              <div className="space-y-2">
                <Label>{fixo.recurrence.kind === 'income' ? 'Conta que recebeu' : 'Debitar de'}</Label>
                <Select value={fixoAccount} onValueChange={setFixoAccount}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{spendingAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{fixo?.recurrence.kind === 'income' ? 'Quem recebeu' : 'Quem pagou'}</Label>
              <Select value={fixoPayer} onValueChange={setFixoPayer}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.profile?.name ?? '—'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {fixo?.recurrence.kind === 'expense' && members.length > 1 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fixoShared} onChange={(e) => setFixoShared(e.target.checked)} />
                Gasto compartilhado (divide igual entre os {members.length} membros)
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFixo(null)}>Cancelar</Button>
            <Button onClick={confirmFixo}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TONES: Record<string, string> = {
  emerald: 'border-l-emerald-500 text-emerald-700',
  primary: 'border-l-primary text-primary',
  green: 'border-l-green-500 text-green-700',
  red: 'border-l-red-500 text-red-700',
};

function Kpi({ label, value, hint, icon, tone }: {
  label: string; value: string; hint: string; icon: React.ReactNode; tone: keyof typeof TONES;
}) {
  return (
    <Card className={`border-l-4 ${TONES[tone]}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
        <CardTitle className="text-xs font-semibold md:text-sm">{label}</CardTitle>
        <span className="opacity-70">{icon}</span>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="break-words text-lg font-bold tabular-nums md:text-2xl">{value}</div>
        <p className="text-[10px] text-muted-foreground md:text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
