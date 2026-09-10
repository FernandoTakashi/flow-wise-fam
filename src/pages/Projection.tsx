import { useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader } from '@/components/PageHeader';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { formatBRL } from '@/lib/money';
import { MONTHS_PT_SHORT, isInMonth, parseISO } from '@/lib/dates';
import { cn } from '@/lib/utils';

const HORIZON = 12;
const brief = (c: number) => {
  const v = c / 100;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return `${Math.round(v)}`;
};

export default function Projection() {
  const {
    loading, today, recurrences, transactions, investments, cards, invoiceView,
    cashBalanceCents, totalInvestedCents, monthSummary,
  } = useFinance();

  const data = useMemo(() => {
    const now = parseISO(today);
    const startMonth = now.getMonth();
    const startYear = now.getFullYear();
    const cardIds = new Set(cards.map((c) => c.id));

    const invBase = investments.reduce((s, i) => s + i.amountCents, 0);
    const monthlyRate = invBase > 0
      ? investments.reduce((s, i) => s + i.amountCents * (i.yieldRateBps / 10000), 0) / invBase
      : 0;

    let varSum = 0; let varCount = 0;
    for (let k = 1; k <= 3; k += 1) {
      const d = new Date(startYear, startMonth - k, 1);
      const m = d.getMonth(); const y = d.getFullYear();
      const s = transactions
        .filter((t) => t.kind === 'expense' && t.status === 'cleared' && !t.recurrenceId
          && !cardIds.has(t.accountId) && isInMonth(t.date, m, y))
        .reduce((acc, t) => acc + t.amountCents, 0);
      if (s > 0) { varSum += s; varCount += 1; }
    }
    const avgVariable = varCount > 0 ? Math.round(varSum / varCount) : 0;

    let cash = cashBalanceCents();
    let invested = totalInvestedCents();
    // mês corrente: o que AINDA falta acontecer (fixos não pagos, faturas em
    // aberto, previstos). O que já caiu está no cashBalanceCents().
    const cur = monthSummary(startMonth, startYear);
    const rows: {
      label: string; total: number; invested: number; cash: number;
      income: number; expenses: number; yield: number; isCurrent: boolean;
    }[] = [];

    for (let i = 0; i <= HORIZON; i += 1) {
      const d = new Date(startYear, startMonth + i, 1);
      const m = d.getMonth(); const y = d.getFullYear();
      const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const monthEnd = `${y}-${String(m + 1).padStart(2, '0')}-31`;

      const activeRec = recurrences.filter((r) => r.active
        && r.startDate <= monthEnd && (!r.endDate || r.endDate >= monthStart));
      const recIncome = activeRec.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amountCents, 0);
      const recExpense = activeRec
        .filter((r) => r.kind === 'expense' && !(r.accountId && cardIds.has(r.accountId)))
        .reduce((s, r) => s + r.amountCents, 0);
      const futureCard = cards.reduce((s, c) => s + invoiceView(c.id, m, y).projectedCents, 0);

      const yieldAmount = invested > 0 ? Math.round(invested * monthlyRate) : 0;

      const income = i === 0 ? cur.pendingIncomeCents : recIncome;
      const expenses = i === 0
        ? cur.pendingExpenseCents
        : recExpense + futureCard + avgVariable;

      invested += i > 0 ? yieldAmount : 0;
      cash += income - expenses;

      rows.push({
        label: `${MONTHS_PT_SHORT[m]}/${String(y).slice(2)}`,
        total: cash + invested,
        invested: Math.max(invested, 0),
        cash: Math.max(cash, 0),
        income,
        expenses,
        yield: yieldAmount,
        isCurrent: i === 0,
      });
    }
    return rows;
  }, [today, recurrences, transactions, investments, cards, invoiceView, cashBalanceCents, totalInvestedCents, monthSummary]);

  const patrimonioHoje = cashBalanceCents() + totalInvestedCents();

  if (loading) return <div className="h-64 animate-pulse rounded-[18px] bg-muted" />;

  const start = patrimonioHoje;
  const end = data[data.length - 1]?.total ?? 0;
  const growth = end - start;
  const growthPct = start !== 0 ? (growth / Math.abs(start)) * 100 : 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Projeção" subtitle="Cenário base para os próximos 12 meses" />

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi label="Patrimônio hoje" value={formatBRL(start)} />
        <Kpi label="Em 12 meses" value={formatBRL(end)} dark />
        <Kpi label="Crescimento" value={`${growth >= 0 ? '+' : ''}${formatBRL(growth)}`}
          valueClass={growth >= 0 ? 'text-[#1F7A52]' : 'text-[#C8452F]'} />
        <Kpi label="Retorno" value={`${growthPct.toFixed(1)}%`}
          valueClass={growthPct >= 0 ? 'text-[#1F7A52]' : 'text-[#C8452F]'} />
      </div>

      {/* gráfico */}
      <div className="rounded-[18px] border border-border bg-card px-6 py-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-display text-[15.5px] font-bold text-foreground">Curva de evolução</div>
            <div className="text-[12px] text-muted-foreground">Cenário base para os próximos 12 meses</div>
          </div>
          <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-primary" /> caixa</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-[#2A8F63]" /> investido</span>
          </div>
        </div>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
              <YAxis hide />
              <Tooltip
                formatter={(v: number, name) => [formatBRL(v), name === 'cash' ? 'Caixa' : 'Investido']}
                labelFormatter={(l) => `Mês ${l}`}
                contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--border))', fontSize: 12 }}
                cursor={{ fill: 'hsl(var(--muted))' }}
              />
              <Bar dataKey="cash" stackId="a" radius={[0, 0, 3, 3]}>
                {data.map((d) => <Cell key={d.label} fill={d.isCurrent ? '#D24E36' : '#EF6A52'} />)}
              </Bar>
              <Bar dataKey="invested" stackId="a" fill="#2A8F63" radius={[8, 8, 0, 0]}>
                <LabelList
                  position="top"
                  content={({ x, y, width, index }) => {
                    if (index == null) return null;
                    const r = data[index];
                    return (
                      <text
                        x={Number(x) + Number(width) / 2}
                        y={Number(y) - 6}
                        textAnchor="middle"
                        fontSize={10.5}
                        fontWeight={700}
                        fill={r.isCurrent ? '#D24E36' : '#5C4C45'}
                      >
                        {brief(r.total)}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* tabela — desktop */}
      <div className="hidden overflow-hidden rounded-[18px] border border-border bg-card md:block">
        <div className="grid grid-cols-[96px_repeat(6,minmax(0,1fr))] gap-2.5 border-b border-border bg-[#FDFAF8] px-[22px] py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#7E6E66]">
          <span>Mês</span>
          <span className="text-right">Entradas</span>
          <span className="text-right">Saídas</span>
          <span className="text-right">Rendimento</span>
          <span className="text-right">Investido</span>
          <span className="text-right">Caixa</span>
          <span className="text-right">Total</span>
        </div>
        {data.map((r) => (
          <div key={r.label}
            className={cn('grid grid-cols-[96px_repeat(6,minmax(0,1fr))] gap-2.5 border-b border-[#F4EDE7] px-[22px] py-3 text-[13px] tabular-nums text-foreground last:border-0',
              r.isCurrent && 'bg-[#FDFAF8]')}>
            <span className="flex items-center gap-1.5 font-semibold">
              {r.label}
              {r.isCurrent && <span className="rounded-full bg-primary/10 px-1 text-[9.5px] font-bold uppercase text-primary">atual</span>}
            </span>
            <span className="text-right text-[#1F7A52]">+{formatBRL(r.income)}</span>
            <span className="text-right text-[#C8452F]">−{formatBRL(r.expenses)}</span>
            <span className="text-right text-[#5C4C45]">{r.yield > 0 ? `+${formatBRL(r.yield)}` : '—'}</span>
            <span className="text-right">{formatBRL(r.invested)}</span>
            <span className="text-right text-muted-foreground">{formatBRL(r.cash)}</span>
            <span className="text-right font-bold">{formatBRL(r.total)}</span>
          </div>
        ))}
      </div>

      {/* tabela — mobile card-list */}
      <div className="space-y-2 md:hidden">
        {data.map((r) => (
          <div key={r.label} className={cn('rounded-[14px] border border-border bg-card p-3.5', r.isCurrent && 'border-primary')}>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-display font-bold text-foreground">
                {r.label}
                {r.isCurrent && <span className="rounded-full bg-primary/10 px-1 text-[9.5px] font-bold uppercase text-primary">atual</span>}
              </span>
              <span className="text-[15px] font-bold tabular-nums text-foreground">{formatBRL(r.total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] tabular-nums">
              <span className="text-muted-foreground">Entradas</span><span className="text-right text-[#1F7A52]">+{formatBRL(r.income)}</span>
              <span className="text-muted-foreground">Saídas</span><span className="text-right text-[#C8452F]">−{formatBRL(r.expenses)}</span>
              <span className="text-muted-foreground">Rendimento</span><span className="text-right">{r.yield > 0 ? `+${formatBRL(r.yield)}` : '—'}</span>
              <span className="text-muted-foreground">Investido / Caixa</span><span className="text-right">{formatBRL(r.invested)} / {formatBRL(r.cash)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="max-w-[720px] text-[12px] leading-relaxed text-[#7E6E66]">
        Mês atual: parte do que ainda falta acontecer (fixos não pagos, faturas em aberto e previstos),
        somada ao saldo de hoje. Meses seguintes: entradas e saídas fixas ativas + parcelas de cartão já
        lançadas + média das saídas variáveis dos últimos 3 meses. Rendimento composto pela taxa média da carteira.
      </p>
    </div>
  );
}

function Kpi({ label, value, valueClass, dark }: { label: string; value: string; valueClass?: string; dark?: boolean }) {
  return (
    <div className={cn('rounded-2xl border px-[18px] py-4', dark ? 'border-ink bg-ink' : 'border-border bg-card')}>
      <p className={cn('text-[11.5px] font-semibold', dark ? 'text-[#9C8A80]' : 'text-[#7E6E66]')}>{label}</p>
      <p className={cn('text-[22px] font-bold tabular-nums', dark ? 'text-on-ink' : 'text-foreground', valueClass)}>{value}</p>
    </div>
  );
}
