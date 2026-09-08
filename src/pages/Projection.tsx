import { useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatBRL } from '@/lib/money';
import { MONTHS_PT_SHORT, isInMonth, parseISO } from '@/lib/dates';
import { TrendingUp } from 'lucide-react';

const HORIZON = 12;

export default function Projection() {
  const {
    loading, today, recurrences, transactions, investments, cards, invoiceView,
    cashBalanceCents, totalInvestedCents,
  } = useFinance();

  const data = useMemo(() => {
    const now = parseISO(today);
    const startMonth = now.getMonth();
    const startYear = now.getFullYear();
    const cardIds = new Set(cards.map((c) => c.id));

    // taxa mensal média ponderada da carteira de investimentos
    const invBase = investments.reduce((s, i) => s + i.amountCents, 0);
    const monthlyRate = invBase > 0
      ? investments.reduce((s, i) => s + i.amountCents * (i.yieldRateBps / 10000), 0) / invBase
      : 0;

    // média das saídas variáveis (não-cartão, não recorrentes) dos últimos 3 meses
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
    const rows: {
      label: string; balance: number; invested: number; cash: number;
      income: number; expenses: number; yield: number; isCurrent: boolean;
    }[] = [];

    for (let i = 0; i <= HORIZON; i += 1) {
      const d = new Date(startYear, startMonth + i, 1);
      const m = d.getMonth(); const y = d.getFullYear();
      const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const monthEnd = `${y}-${String(m + 1).padStart(2, '0')}-31`;

      const activeRec = recurrences.filter((r) => r.active
        && r.startDate <= monthEnd && (!r.endDate || r.endDate >= monthStart));
      const income = activeRec.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amountCents, 0);
      // só recorrências que saem da conta (as de cartão entram via a fatura, abaixo)
      const recExpense = activeRec
        .filter((r) => r.kind === 'expense' && !(r.accountId && cardIds.has(r.accountId)))
        .reduce((s, r) => s + r.amountCents, 0);
      // fatura estimada de cada cartão nesse mês (lançado + fixos de cartão previstos)
      const futureCard = cards.reduce((s, c) => s + invoiceView(c.id, m, y).projectedCents, 0);

      const yieldAmount = invested > 0 ? Math.round(invested * monthlyRate) : 0;
      const expenses = i === 0 ? recExpense + futureCard : recExpense + futureCard + avgVariable;

      if (i > 0) {
        invested += yieldAmount;
        cash += income - expenses;
      }

      rows.push({
        label: `${MONTHS_PT_SHORT[m]}/${String(y).slice(2)}`,
        balance: cash + invested,
        invested,
        cash,
        income,
        expenses,
        yield: yieldAmount,
        isCurrent: i === 0,
      });
    }
    return rows;
  }, [today, recurrences, transactions, investments, cards, invoiceView, cashBalanceCents, totalInvestedCents]);

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;

  const start = data[0]?.balance ?? 0;
  const end = data[data.length - 1]?.balance ?? 0;
  const growth = end - start;
  const growthPct = start !== 0 ? (growth / Math.abs(start)) * 100 : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Projeção financeira" subtitle="Cenário base para os próximos 12 meses" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Patrimônio hoje" value={formatBRL(start)} />
        <Kpi label="Em 12 meses" value={formatBRL(end)} className="text-primary" />
        <Kpi label="Crescimento" value={`${growth >= 0 ? '+' : ''}${formatBRL(growth)}`} className={growth >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        <Kpi label="Retorno" value={`${growthPct.toFixed(1)}%`} className={growthPct >= 0 ? 'text-emerald-600' : 'text-red-600'} />
      </div>

      <Card>
        <CardHeader className="p-4 pb-0"><CardTitle className="text-base">Curva de evolução</CardTitle></CardHeader>
        <CardContent className="h-[280px] p-2 md:p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis hide />
              <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="balance" name="Patrimônio" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="invested" name="Investido" stroke="#10b981" strokeDasharray="4 4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Mês</th>
              <th className="p-3 text-right">Entradas</th>
              <th className="p-3 text-right">Saídas</th>
              <th className="p-3 text-right">Rendimento</th>
              <th className="p-3 text-right">Investido</th>
              <th className="p-3 text-right">Caixa</th>
              <th className="p-3 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i} className={`border-t tabular-nums ${r.isCurrent ? 'bg-muted/30' : ''}`}>
                <td className="p-3 font-medium">
                  {r.label}{r.isCurrent && <Badge variant="outline" className="ml-2 h-4 px-1 text-[9px]">Atual</Badge>}
                </td>
                <td className="p-3 text-right text-emerald-600">+{formatBRL(r.income)}</td>
                <td className="p-3 text-right text-red-600">−{formatBRL(r.expenses)}</td>
                <td className="p-3 text-right text-purple-600">{r.yield > 0 ? `+${formatBRL(r.yield)}` : '—'}</td>
                <td className="p-3 text-right">{formatBRL(r.invested)}</td>
                <td className="p-3 text-right text-muted-foreground">{formatBRL(r.cash)}</td>
                <td className="p-3 text-right font-bold">{formatBRL(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Estimativa: entradas e saídas fixas ativas de cada mês + parcelas de cartão já lançadas +
        média das saídas variáveis dos últimos 3 meses. Rendimento composto pela taxa média da carteira.
      </p>
    </div>
  );
}

function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums md:text-xl ${className ?? ''}`}>{value}</p>
    </CardContent></Card>
  );
}
