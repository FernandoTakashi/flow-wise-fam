import { useMemo, useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line, AreaChart, Area,
} from 'recharts';
import { formatBRL } from '@/lib/money';
import { formatFullDate, isInMonth, isoParts, MONTHS_PT_SHORT } from '@/lib/dates';
import type { Transaction } from '@/types';
import { Download, RefreshCw } from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1', '#84cc16'];
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

type Lens = 'competencia' | 'caixa';

export default function Reports() {
  const { loading, today, transactions, activeCategories, members, categoryName, memberName, accountName, accounts } = useFinance();

  const [lens, setLens] = useState<Lens>('competencia');
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(today);
  const [category, setCategory] = useState('');
  const [memberId, setMemberId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [search, setSearch] = useState('');

  const range = useMemo(() => (start <= end ? { a: start, b: end } : { a: end, b: start }), [start, end]);

  const inRange = (t: Transaction): boolean => {
    if (lens === 'caixa') return t.date >= range.a && t.date <= range.b;
    // competência: compara o mês de referência com o intervalo
    const ay = isoParts(range.a).y; const am = isoParts(range.a).m + 1;
    const by = isoParts(range.b).y; const bm = isoParts(range.b).m + 1;
    const startKey = ay * 12 + am; const endKey = by * 12 + bm;
    const tKey = t.refYear * 12 + t.refMonth;
    return tKey >= startKey && tKey <= endKey;
  };

  const expenses = useMemo(() => transactions.filter((t) => {
    if (t.kind !== 'expense' || t.status !== 'cleared') return false;
    if (!inRange(t)) return false;
    if (category && t.categoryId !== category) return false;
    if (memberId && t.memberId !== memberId) return false;
    if (accountId && t.accountId !== accountId) return false;
    if (search && !(t.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [transactions, range, category, memberId, accountId, search, lens]);

  const incomes = useMemo(() => transactions.filter((t) =>
    t.kind === 'income' && t.status === 'cleared' && inRange(t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [transactions, range, lens]);

  const totalExpense = expenses.reduce((s, t) => s + t.amountCents, 0);
  const totalIncome = incomes.reduce((s, t) => s + t.amountCents, 0);
  const result = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (result / totalIncome) * 100 : 0;
  const pct = (v: number) => (totalExpense > 0 ? (v / totalExpense) * 100 : 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of expenses) {
      const key = t.categoryId ? categoryName(t.categoryId) : 'Sem categoria';
      map.set(key, (map.get(key) ?? 0) + t.amountCents);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses, categoryName]);

  const byAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of expenses) map.set(accountName(t.accountId), (map.get(accountName(t.accountId)) ?? 0) + t.amountCents);
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses, accountName]);

  const evolution = useMemo(() => {
    const end0 = new Date(range.b);
    const out: { name: string; Despesas: number; Receitas: number; Saldo: number }[] = [];
    for (let k = 5; k >= 0; k -= 1) {
      const d = new Date(end0.getFullYear(), end0.getMonth() - k, 1);
      const m = d.getMonth(); const y = d.getFullYear();
      const key = lens === 'competencia'
        ? (t: Transaction) => t.refMonth === m + 1 && t.refYear === y
        : (t: Transaction) => isInMonth(t.date, m, y);
      const exp = transactions.filter((t) => t.kind === 'expense' && t.status === 'cleared' && key(t)).reduce((s, t) => s + t.amountCents, 0);
      const inc = transactions.filter((t) => t.kind === 'income' && t.status === 'cleared' && key(t)).reduce((s, t) => s + t.amountCents, 0);
      out.push({ name: `${MONTHS_PT_SHORT[m]}/${String(y).slice(2)}`, Despesas: exp, Receitas: inc, Saldo: inc - exp });
    }
    return out;
  }, [transactions, range.b, lens]);

  // velocidade de gasto: acumulado por dia (sempre pela data-caixa)
  const pace = useMemo(() => {
    const daily = new Map<string, number>();
    for (const t of expenses) daily.set(t.date, (daily.get(t.date) ?? 0) + t.amountCents);
    const days: string[] = [];
    const s = new Date(range.a); const e = new Date(range.b);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    let acc = 0;
    return days.map((iso) => { acc += daily.get(iso) ?? 0; return { day: iso.slice(8) + '/' + iso.slice(5, 7), acumulado: acc }; });
  }, [expenses, range]);

  const exportCsv = () => {
    const rows = [
      ['Data', 'Competencia', 'Descricao', 'Categoria', 'Conta', 'Responsavel', 'Valor'],
      ...expenses.map((t) => [
        t.date, `${String(t.refMonth).padStart(2, '0')}/${t.refYear}`,
        (t.description || '').replace(/;/g, ','), categoryName(t.categoryId),
        accountName(t.accountId), t.memberId ? memberName(t.memberId) : '', (t.amountCents / 100).toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio_${range.a}_a_${range.b}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clear = () => {
    setStart(firstOfMonth()); setEnd(today);
    setCategory(''); setMemberId(''); setAccountId(''); setSearch('');
  };

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Relatórios"
        subtitle="Análise das suas finanças"
        action={
          <>
            <Button variant="outline" onClick={clear}><RefreshCw className="mr-2 h-4 w-4" /> Resetar</Button>
            <Button onClick={exportCsv} disabled={expenses.length === 0}><Download className="mr-2 h-4 w-4" /> Exportar</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={lens} onValueChange={(v) => setLens(v as Lens)}>
          <TabsList>
            <TabsTrigger value="competencia">Competência</TabsTrigger>
            <TabsTrigger value="caixa">Caixa</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-[11px] text-muted-foreground">
          {lens === 'competencia' ? 'compra no cartão conta no mês da fatura' : 'conta na data em que o dinheiro se move'}
        </span>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1"><Label className="text-xs">De</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Até</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Categoria</Label>
            <Select value={category || 'all'} onValueChange={(v) => setCategory(v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {activeCategories.filter((c) => c.kind === 'expense').map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Responsável</Label>
            <Select value={memberId || 'all'} onValueChange={(v) => setMemberId(v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.profile?.name ?? '—'}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Conta</Label>
            <Select value={accountId || 'all'} onValueChange={(v) => setAccountId(v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {accounts.filter((a) => !a.archived).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Busca</Label>
            <Input placeholder="Uber, mercado…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Receita" value={formatBRL(totalIncome)} className="text-emerald-600" />
        <Kpi label="Despesa" value={formatBRL(totalExpense)} className="text-red-600" />
        <Kpi label="Resultado" value={formatBRL(result)} className={result >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        <Kpi label="Taxa de economia" value={`${savingsRate.toFixed(1)}%`} className="text-primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="p-4 pb-0"><CardTitle className="text-sm">Fluxo de caixa (6 meses)</CardTitle>
            <CardDescription>Entradas e saídas por {lens === 'competencia' ? 'competência' : 'data'}</CardDescription></CardHeader>
          <CardContent className="h-[260px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={evolution} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Legend verticalAlign="top" height={30} iconType="circle" />
                <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} barSize={18} />
                <Line type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="p-4 pb-0"><CardTitle className="text-sm">Velocidade de gasto</CardTitle>
            <CardDescription>Despesa acumulada no período (por data)</CardDescription></CardHeader>
          <CardContent className="h-[220px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pace} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pace" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Area type="monotone" dataKey="acumulado" stroke="#f59e0b" strokeWidth={3} fill="url(#pace)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-0"><CardTitle className="text-sm">Gastos por categoria</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-4 p-4 md:flex-row">
            {byCategory.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <>
                <div className="h-[180px] w-full md:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byCategory} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                        {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-1.5 md:w-1/2">
                  {byCategory.slice(0, 8).map((e, i) => (
                    <div key={e.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 truncate">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {e.name}
                      </span>
                      <span className="font-medium tabular-nums">{pct(e.value).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-0"><CardTitle className="text-sm">Gastos por conta</CardTitle></CardHeader>
          <CardContent className="space-y-3 p-4">
            {byAccount.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
            ) : byAccount.map((item) => (
              <div key={item.name} className="space-y-1">
                <div className="flex justify-between text-xs"><span className="font-medium">{item.name}</span>
                  <span className="tabular-nums">{formatBRL(item.value)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-primary/80" style={{ width: `${Math.min(pct(item.value), 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/20 p-4"><CardTitle className="text-sm">Extrato do filtro ({expenses.length})</CardTitle></CardHeader>
        <div className="max-h-[420px] overflow-y-auto">
          {expenses.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento no filtro.</p>
          ) : (
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr><th className="p-3">Data</th><th className="p-3">Descrição</th>
                  <th className="hidden p-3 md:table-cell">Categoria</th><th className="p-3 text-right">Valor</th></tr>
              </thead>
              <tbody className="divide-y">
                {[...expenses].sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) => (
                  <tr key={t.id} className="hover:bg-muted/20">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{formatFullDate(t.date)}</td>
                    <td className="p-3">{t.description || '—'}</td>
                    <td className="hidden p-3 md:table-cell"><Badge variant="secondary" className="text-[10px]">{categoryName(t.categoryId)}</Badge></td>
                    <td className="p-3 text-right font-semibold tabular-nums">{formatBRL(t.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums md:text-xl ${className ?? ''}`}>{value}</p>
    </CardContent></Card>
  );
}
