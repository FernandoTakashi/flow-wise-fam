import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoneyInput } from '@/components/MoneyInput';
import { PageHeader } from '@/components/PageHeader';
import { OnboardingTip } from '@/components/OnboardingTip';
import { useToast } from '@/hooks/use-toast';
import { formatBRL } from '@/lib/money';
import { MONTHS_PT, isoParts } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { CreditCard, Repeat, TrendingUp, Lock } from 'lucide-react';
import type { OccurrenceView } from '@/contexts/FinanceContext';

export default function Dashboard() {
  const {
    loading, selectedMonth, today, monthSummary, cards, invoiceView, recurrenceOccurrences,
    spendingAccounts, members, memberName, userId, isPeriodLocked, spendByMember, jointSpendCents,
    payCardInvoice, markRecurrenceOccurrence, memberBalances,
    accountBalanceCents, cardAvailableCents,
  } = useFinance();
  const { toast } = useToast();
  const { month, year } = selectedMonth;
  const locked = isPeriodLocked(month, year);
  const mesLower = MONTHS_PT[month].toLowerCase();

  const { y: curY, m: curM } = isoParts(today);
  const rel: 'past' | 'current' | 'future' =
    year < curY || (year === curY && month < curM) ? 'past'
      : year > curY || (year === curY && month > curM) ? 'future'
        : 'current';

  const summary = useMemo(() => monthSummary(month, year), [monthSummary, month, year]);
  const pending = useMemo(
    () => recurrenceOccurrences(month, year).filter((o) => o.status !== 'paid'),
    [recurrenceOccurrences, month, year],
  );
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
  const ranking = useMemo(() => {
    const indiv = spendByMember(month, year)
      .filter((r) => r.totalCents > 0)
      .map((r) => ({ key: r.memberId, label: memberName(r.memberId), totalCents: r.totalCents }));
    const joint = jointSpendCents(month, year);
    const all = joint > 0 ? [...indiv, { key: '__joint__', label: 'Em conjunto', totalCents: joint }] : indiv;
    return all.sort((a, b) => b.totalCents - a.totalCents);
  }, [spendByMember, jointSpendCents, memberName, month, year]);
  const rankTop = ranking[0]?.totalCents ?? 0;

  const aPagarTotal = pendingExpenses.reduce((s, o) => s + o.amountCents, 0)
    + openInvoices.reduce((s, x) => s + x.view.postedCents, 0);
  const aReceberTotal = pendingIncomes.reduce((s, o) => s + o.amountCents, 0);

  // O hero só faz sentido como "projeção" no mês corrente (saldo de hoje + o que
  // falta). Em mês passado/futuro vira "resultado" por competência.
  const resultRealized = summary.incomeRealizedCents - summary.expenseRealizedCents;
  const resultExpected = summary.pendingIncomeCents - summary.pendingExpenseCents;
  const hero = rel === 'current'
    ? {
      label: 'Projeção fim do mês',
      value: summary.projectedBalanceCents,
      note: `Saldo em caixa depois de quitar tudo o que tem competência em ${mesLower}.`,
      stats: [
        { label: 'Saldo em caixa', value: summary.cashBalanceCents, hint: 'hoje, regime de caixa', cls: undefined as string | undefined },
        { label: 'A receber', value: summary.pendingIncomeCents, hint: 'entradas previstas', cls: 'text-pos' },
        { label: 'A pagar', value: summary.pendingExpenseCents, hint: 'fixos + faturas + previstos', cls: 'text-neg' },
      ],
    }
    : rel === 'past'
      ? {
        label: `Resultado de ${mesLower}`,
        value: resultRealized,
        note: `Entradas menos saídas realizadas com competência em ${mesLower}.`,
        stats: [
          { label: 'Entradas', value: summary.incomeRealizedCents, hint: 'realizadas', cls: 'text-pos' },
          { label: 'Saídas', value: summary.expenseRealizedCents, hint: 'realizadas', cls: 'text-neg' },
          { label: 'Resultado', value: resultRealized, hint: 'entradas − saídas', cls: resultRealized >= 0 ? 'text-pos' : 'text-neg' },
        ],
      }
      : {
        label: `Previsto para ${mesLower}`,
        value: resultExpected,
        note: `Entradas menos saídas previstas para ${mesLower} (regime de competência).`,
        stats: [
          { label: 'A receber', value: summary.pendingIncomeCents, hint: 'entradas previstas', cls: 'text-pos' },
          { label: 'A pagar', value: summary.pendingExpenseCents, hint: 'fixos + faturas + previstos', cls: 'text-neg' },
          { label: 'Resultado', value: resultExpected, hint: 'previsto', cls: resultExpected >= 0 ? 'text-pos' : 'text-neg' },
        ],
      };

  const [payCard, setPayCard] = useState<{ cardId: string; total: number } | null>(null);
  const [payFrom, setPayFrom] = useState('');
  const [payer, setPayer] = useState(userId ?? '');
  const [fixo, setFixo] = useState<OccurrenceView | null>(null);
  const [fixoAmount, setFixoAmount] = useState(0);
  const [fixoPayer, setFixoPayer] = useState(userId ?? '');
  const [fixoDate, setFixoDate] = useState(today);
  const [fixoShared, setFixoShared] = useState(false);
  const [fixoAccount, setFixoAccount] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <DashboardSkeleton />;

  const confirmPayCard = async () => {
    if (busy) return;
    if (!payCard || !payFrom) { toast({ title: 'Escolha a conta de origem', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await payCardInvoice(payCard.cardId, month, year, payFrom, today, payer || null);
      toast({ title: 'Fatura paga', description: 'Saldo atualizado.' });
      setPayCard(null);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const confirmFixo = async () => {
    if (busy) return;
    if (!fixo || fixoAmount <= 0) { toast({ title: 'Valor inválido', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await markRecurrenceOccurrence(
        fixo.recurrence.id, month, year, fixoAmount, fixoPayer || null,
        fixoDate || undefined, fixoShared, fixo.onCard ? undefined : fixoAccount || undefined,
      );
      toast({ title: fixo.onCard ? 'Lançado no cartão' : 'Marcado como pago' });
      setFixo(null);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const openFixo = (o: OccurrenceView) => {
    setFixo(o); setFixoAmount(o.amountCents); setFixoPayer(userId ?? ''); setFixoDate(today);
    setFixoShared(o.recurrence.shared);
    const recAcc = spendingAccounts.find((a) => a.id === o.recurrence.accountId);
    setFixoAccount(recAcc?.id ?? spendingAccounts[0]?.id ?? '');
  };

  const occMeta = (o: OccurrenceView, income: boolean) => {
    const bits: string[] = [o.recurrence.day <= 0 ? 'vence no último dia' : `vence dia ${o.recurrence.day}`];
    if (o.onCard) bits.push('no cartão');
    if (o.status === 'pending') bits.push('conta chegou');
    if (o.recurrence.shared) bits.push('em conjunto');
    if (!income && o.recurrence.autopay) bits.push('débito automático');
    return `Fixo · ${bits.join(' · ')}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" subtitle={`Competência de ${MONTHS_PT[month]} de ${year}`} extra={locked ? <LockPill /> : undefined} />

      <OnboardingTip pageKey="dashboard" title="Este é o resumo do mês por competência">
        O saldo grande é o de hoje; o resto da tela olha pro mês selecionado acima — o que já entrou/saiu e o que ainda falta pagar ou receber, mesmo que a data caia em outro mês.
      </OnboardingTip>

      {/* HERO */}
      <div className="flex flex-col gap-6 rounded-[18px] bg-ink px-[26px] py-6 text-on-ink sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[#A9968C]">{hero.label}</div>
          <div className="font-display text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums text-on-ink sm:text-[52px]">
            {formatBRL(hero.value)}
          </div>
          <div className="mt-2 max-w-md text-[13.5px] leading-snug text-[#BCA79C]">
            {hero.note}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-4 pb-1.5 sm:flex-nowrap">
          {hero.stats.map((s) => (
            <HeroStat key={s.label} label={s.label} value={formatBRL(s.value)} hint={s.hint} valueClass={s.cls} />
          ))}
        </div>
      </div>

      {/* GRID */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ListCard
          title="A pagar"
          sub={`Fixos e faturas de ${mesLower} · ${formatBRL(aPagarTotal)}`}
          link={{ to: '/fixos', label: 'Ver gastos fixos' }}
        >
          {pendingExpenses.length === 0 && openInvoices.length === 0 && <EmptyRow text="Nada em aberto." />}
          {pendingExpenses.map((o) => {
            const late = o.dueDateISO < today;
            const changed = o.amountCents !== o.estimatedCents;
            return (
              <PendRow
                key={o.recurrence.id}
                icon={<Repeat className="h-[18px] w-[18px]" />}
                tileClass={late ? 'bg-[#FBE9E4] text-[#C8452F]' : 'bg-[#F4EDE7] text-[#8A6A57]'}
                name={o.recurrence.description}
                meta={`${occMeta(o, false)}${late ? ' · em atraso' : ''}`}
                value={formatBRL(o.amountCents)}
                valueSub={changed ? `previsto ${formatBRL(o.estimatedCents)}` : undefined}
                button={{ label: o.onCard ? 'Lançar' : 'Paguei', onClick: () => openFixo(o), disabled: locked }}
              />
            );
          })}
          {openInvoices.map(({ card, view }) => (
            <PendRow
              key={card.id}
              icon={<CreditCard className="h-[18px] w-[18px]" />}
              tileClass="bg-[#E7F2F1] text-[#2F8F8A]"
              name={`Fatura ${card.name}`}
              meta={`${view.status === 'closed' ? 'Fechada' : 'Aberta'} · fecha dia ${card.closingDay ?? '—'} · vence dia ${card.dueDay ?? '—'}`}
              value={formatBRL(view.postedCents)}
              valueSub={view.projectedCents > view.postedCents ? `prev. ${formatBRL(view.projectedCents)}` : undefined}
              button={{
                label: 'Pagar',
                disabled: locked,
                onClick: () => { setPayCard({ cardId: card.id, total: view.postedCents }); setPayFrom(spendingAccounts[0]?.id ?? ''); setPayer(userId ?? ''); },
              }}
            />
          ))}
        </ListCard>

        <div className="space-y-4">
          <ListCard title="A receber" sub={`Entradas previstas para ${mesLower} · ${formatBRL(aReceberTotal)}`}>
            {pendingIncomes.length === 0 && <EmptyRow text="Nada previsto." />}
            {pendingIncomes.map((o) => (
              <PendRow
                key={o.recurrence.id}
                icon={<TrendingUp className="h-[18px] w-[18px]" />}
                tileClass="bg-[#E8F5EE] text-[#2A8F63]"
                name={o.recurrence.description}
                meta={occMeta(o, true).replace('vence', 'recebe')}
                value={formatBRL(o.amountCents)}
                valueClass="text-[#1F7A52]"
                button={{ label: 'Recebi', onClick: () => openFixo(o), disabled: locked, tone: 'green' }}
              />
            ))}
          </ListCard>

          {(spendingAccounts.length > 0 || cards.length > 0) && (
            <div className="overflow-hidden rounded-[18px] border border-border bg-card">
              <div className="flex items-baseline justify-between px-[22px] pb-3 pt-[18px]">
                <div>
                  <div className="font-display text-[15.5px] font-bold text-foreground">Contas</div>
                  <div className="text-[12px] text-muted-foreground">Saldo de hoje</div>
                </div>
                <span className="text-[15px] font-bold tabular-nums text-foreground">
                  {formatBRL(spendingAccounts.reduce((s, a) => s + accountBalanceCents(a.id), 0))}
                </span>
              </div>
              <div className="border-t border-[#F1E8E1]">
                {spendingAccounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-[22px] py-2.5 text-[13px]">
                    <span className="truncate text-foreground">{a.name}</span>
                    <span className={cn('shrink-0 tabular-nums font-semibold',
                      accountBalanceCents(a.id) < 0 ? 'text-[#C8452F]' : 'text-foreground')}>
                      {formatBRL(accountBalanceCents(a.id))}
                    </span>
                  </div>
                ))}
                {cards.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-[22px] py-2.5 text-[13px]">
                    <span className="truncate text-muted-foreground">{c.name} <span className="text-[11px]">· cartão</span></span>
                    <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                      {formatBRL(invoiceView(c.id, month, year).postedCents)} nesta fatura
                      {c.creditLimitCents != null && (
                        <span className="text-[11px]"> · {formatBRL(cardAvailableCents(c.id))} livre</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(ranking.length > 0 || balances.length > 0) && (
            <div className="overflow-hidden rounded-[18px] border border-border bg-card">
              <div className="px-[22px] pb-3 pt-[18px]">
                <div className="font-display text-[15.5px] font-bold text-foreground">Quem gastou mais</div>
                <div className="text-[12px] text-muted-foreground">Despesas com competência em {mesLower}</div>
              </div>

              {ranking.length > 0 && (
                <div className="space-y-3 px-[22px] pb-4">
                  {ranking.map((r, i) => (
                    <div key={r.key} className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-[13px] font-semibold text-foreground">{r.label}</span>
                        <span className="text-[13px] tabular-nums text-muted-foreground">{formatBRL(r.totalCents)}</span>
                      </div>
                      <div className="h-[7px] overflow-hidden rounded-full bg-[#F1E8E1]">
                        <div
                          className={cn('h-full rounded-full', i === 0 ? 'bg-[#221A17]' : 'bg-[#C6B4AA]')}
                          style={{ width: `${rankTop > 0 ? Math.max(4, (r.totalCents / rankTop) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {balances.length > 0 && (
                <div className="space-y-2 border-t border-[#F1E8E1] px-[22px] py-4">
                  <div className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-[#7E6E66]">Divisão entre membros</div>
                  {balances.map((b) => (
                    <div key={b.memberId} className="flex items-center justify-between rounded-xl border border-[#DCEDE7] bg-[#F4F9F7] px-3.5 py-3">
                      <span className="text-[13px] font-semibold text-[#1F6B67]">
                        {memberName(b.memberId)} {b.netCents > 0 ? 'tem a receber' : 'deve'}
                      </span>
                      <span className="text-[15px] font-bold tabular-nums text-[#1F6B67]">{formatBRL(Math.abs(b.netCents))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialog pagar fatura */}
      <Dialog open={!!payCard} onOpenChange={(o) => !o && setPayCard(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Pagar fatura</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 p-2 text-center text-sm">Valor: <strong className="tabular-nums">{payCard && formatBRL(payCard.total)}</strong></div>
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
            <Button variant="outline" onClick={() => setPayCard(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={confirmPayCard} disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmar fixo */}
      <Dialog open={!!fixo} onOpenChange={(o) => !o && setFixo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{fixo?.recurrence.kind === 'income' ? 'Confirmar recebimento' : fixo?.onCard ? 'Lançar no cartão' : 'Confirmar pagamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {fixo?.recurrence.description} · previsto <span className="tabular-nums">{fixo && formatBRL(fixo.estimatedCents)}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor</Label>
                {fixo?.recurrence.variableAmount
                  ? <MoneyInput valueCents={fixoAmount} onChangeCents={setFixoAmount} autoFocus />
                  : <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-bold tabular-nums">{formatBRL(fixoAmount)}</div>}
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
                Gasto em conjunto (aparece em “em conjunto”, não no total individual)
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFixo(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={confirmFixo} disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar'}</Button>
          </DialogFooter>
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

function HeroStat({ label, value, hint, valueClass }: { label: string; value: string; hint: string; valueClass?: string }) {
  return (
    <div>
      <div className="whitespace-nowrap text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#9C8A80]">{label}</div>
      <div className={cn('text-[21px] font-bold tabular-nums text-on-ink', valueClass)}>{value}</div>
      <div className="text-[11.5px] text-[#9C8A80]">{hint}</div>
    </div>
  );
}

function ListCard({
  title, sub, link, children,
}: { title: string; sub: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card">
      <div className="flex items-start justify-between gap-3 px-[22px] pb-3 pt-[18px]">
        <div className="min-w-0">
          <div className="font-display text-[15.5px] font-bold text-foreground">{title}</div>
          <div className="truncate text-[12px] text-muted-foreground">{sub}</div>
        </div>
        {link && (
          <Link to={link.to} className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-accent">
            {link.label}
          </Link>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="border-t border-[#F1E8E1] px-[22px] py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function PendRow({
  icon, tileClass, name, meta, value, valueSub, valueClass, button,
}: {
  icon: ReactNode; tileClass: string; name: string; meta: string;
  value: string; valueSub?: string; valueClass?: string;
  button: { label: string; onClick: () => void; disabled?: boolean; tone?: 'green' };
}) {
  return (
    <div className="flex items-center gap-[13px] border-t border-[#F1E8E1] px-[22px] py-[13px] transition-colors hover:bg-[#FDFAF8]">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]', tileClass)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-foreground">{name}</div>
        <div className="truncate text-[11.5px] text-muted-foreground">{meta}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className={cn('text-[14.5px] font-bold tabular-nums text-foreground', valueClass)}>{value}</div>
        {valueSub && <div className="text-[11px] tabular-nums text-muted-foreground">{valueSub}</div>}
      </div>
      <button
        type="button"
        onClick={button.onClick}
        disabled={button.disabled}
        className={cn(
          'h-[31px] shrink-0 rounded-[9px] border border-[#E2D7CF] bg-card px-3 text-[12.5px] font-semibold text-[#5C4C45] transition-colors disabled:opacity-40',
          button.tone === 'green'
            ? 'hover:border-[#2A8F63] hover:text-[#1F7A52]'
            : 'hover:border-primary hover:text-[#D24E36]',
        )}
      >
        {button.label}
      </button>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-[150px] animate-pulse rounded-[18px] bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="h-72 animate-pulse rounded-[18px] bg-muted" />
        <div className="h-72 animate-pulse rounded-[18px] bg-muted" />
      </div>
    </div>
  );
}
