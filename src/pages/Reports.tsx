import { useState, useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, Download, Filter, Calendar, DollarSign,
  User, Tag, CreditCard, Search, RefreshCw,
  BarChart3, PieChart as PieChartIcon, TrendingUp, Info
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ExpenseCategory, ExpenseType } from '@/types';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, 
  Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

interface FilterState {
  startDate: string;
  endDate: string;
  category: string;
  type: string;
  paymentMethod: string;
  userId: string;
  description: string;
}

export default function Reports() {
  const { state, getCurrentBalance, getActiveFixedExpenses } = useFinance();
  
  const [filters, setFilters] = useState<FilterState>({
    startDate: format(subMonths(new Date(), 1), 'yyyy-MM-01'), // Default: Início do mês passado
    endDate: format(new Date(), 'yyyy-MM-dd'),
    category: '',
    type: '',
    paymentMethod: '',
    userId: '',
    description: ''
  });

  const categories: { value: ExpenseCategory; label: string }[] = [
    { value: 'alimentacao', label: 'Alimentação' },
    { value: 'transporte', label: 'Transporte' },
    { value: 'lazer', label: 'Lazer' },
    { value: 'saude', label: 'Saúde' },
    { value: 'educacao', label: 'Educação' },
    { value: 'moradia', label: 'Moradia' },
    { value: 'vestuario', label: 'Vestuário' },
    { value: 'outros', label: 'Outros' }
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // 1. Filtragem Inteligente de Despesas
  const filteredExpenses = useMemo(() => {
    return state.expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      if (filters.startDate && expenseDate < new Date(filters.startDate)) return false;
      if (filters.endDate && expenseDate > new Date(filters.endDate)) return false;
      if (filters.category && expense.category !== filters.category) return false;
      if (filters.type && expense.type !== filters.type) return false;
      if (filters.paymentMethod && expense.paymentMethod !== filters.paymentMethod) return false;
      if (filters.userId && expense.userId !== filters.userId) return false;
      if (filters.description && !expense.description.toLowerCase().includes(filters.description.toLowerCase())) return false;
      return true;
    });
  }, [state.expenses, filters]);

  // 2. Cálculo de Métricas de Insight
  const metrics = useMemo(() => {
    const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const count = filteredExpenses.length;
    const avg = count > 0 ? total / count : 0;
    
    // Maior gasto único
    const maxExpense = filteredExpenses.length > 0 
      ? [...filteredExpenses].sort((a, b) => b.amount - a.amount)[0] 
      : null;

    return { total, count, avg, maxExpense };
  }, [filteredExpenses]);

  // 3. Dados para Evolução Mensal (Últimos 6 meses)
  const monthlyEvolutionData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date()
    });

    return months.map(m => {
      const monthStr = format(m, 'MMM/yy', { locale: ptBR });
      
      // Gastos variáveis + parcelas
      const varTotal = state.expenses
        .filter(e => isSameMonth(new Date(e.date), m))
        .reduce((sum, e) => sum + e.amount, 0);
      
      // Gastos fixos vigentes naquele mês
      const fixedTotal = getActiveFixedExpenses(m.getMonth(), m.getFullYear())
        .reduce((sum, f) => sum + f.amount, 0);

      return {
        month: monthStr,
        Variavel: varTotal,
        Fixo: fixedTotal,
        Total: varTotal + fixedTotal
      };
    });
  }, [state.expenses, state.fixedExpenses, state.fixedPayments]);

  // 4. Dados para Pizza (Categorias)
  const categoryChartData = useMemo(() => {
    return categories.map(cat => {
      const total = filteredExpenses
        .filter(e => e.category === cat.value)
        .reduce((sum, e) => sum + e.amount, 0);
      return { name: cat.label, value: total };
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  // --- CORES E TEMA ---
  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

  const clearFilters = () => {
    setFilters({ startDate: '', endDate: '', category: '', type: '', paymentMethod: '', userId: '', description: '' });
  };

  const exportToCsv = () => {
    const headers = ['Data', 'Descricao', 'Categoria', 'Metodo', 'Valor', 'Usuario'];
    const rows = filteredExpenses.map(e => [
      format(new Date(e.date), 'dd/MM/yyyy'),
      e.description,
      e.category,
      e.paymentMethod,
      e.amount.toFixed(2),
      state.users.find(u => u.id === e.userId)?.name || 'N/A'
    ]);
    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${format(new Date(), 'dd-MM-yyyy')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relatórios Inteligentes</h1>
          <p className="text-muted-foreground">Insights baseados em {filteredExpenses.length} lançamentos filtrados</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={clearFilters}><RefreshCw className="w-4 h-4 mr-2" /> Resetar</Button>
            <Button onClick={exportToCsv} className="bg-emerald-600 hover:bg-emerald-700"><Download className="w-4 h-4 mr-2" /> Exportar CSV</Button>
        </div>
      </div>

      {/* Seção de Filtros */}
      <Card className="shadow-card border-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><Filter className="w-5 h-5 text-primary" /> Filtros Avançados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Período</Label>
              <div className="flex gap-2">
                <Input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="text-xs" />
                <Input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={filters.category} onValueChange={v => setFilters({...filters, category: v})}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Todas as categorias</SelectItem>
                  {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Usuário</Label>
              <Select value={filters.userId} onValueChange={v => setFilters({...filters, userId: v})}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Todos os usuários</SelectItem>
                  {state.users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar texto..." className="pl-8" value={filters.description} onChange={e => setFilters({...filters, description: e.target.value})} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Métricas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Volume Total Filtrado</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(metrics.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Gasto Médio por Item</p>
            <p className="text-2xl font-bold">{formatCurrency(metrics.avg)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Maior Lançamento</p>
            <p className="text-xl font-bold truncate">{metrics.maxExpense ? formatCurrency(metrics.maxExpense.amount) : '---'}</p>
            <p className="text-[10px] text-muted-foreground uppercase">{metrics.maxExpense?.description}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-emerald-800">Saldo Disponível (Hoje)</p>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(getCurrentBalance())}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos Principais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Evolução Temporal */}
        <Card className="lg:col-span-2 shadow-card">
          <CardHeader>
            <CardTitle className="text-md flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary"/> Evolução Mensal (Fixos vs Variáveis)</CardTitle>
            <CardDescription>Comparativo de gastos totais nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyEvolutionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} 
                    formatter={(v) => formatCurrency(Number(v))} 
                />
                <Legend iconType="circle" />
                <Bar dataKey="Fixo" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} barSize={40} />
                <Bar dataKey="Variavel" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição por Categoria */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-md flex items-center gap-2"><PieChartIcon className="w-4 h-4 text-primary"/> Onde está o dinheiro?</CardTitle>
            <CardDescription>Distribuição por categoria (Período filtrado)</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] flex flex-col items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryChartData}
                  cx="50%" cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 w-full mt-4">
               {categoryChartData.slice(0, 4).map((d, i) => (
                   <div key={i} className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length]}} />
                       <span className="text-[10px] text-muted-foreground truncate">{d.name}</span>
                   </div>
               ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking de Usuários e Tabela de Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
              <CardHeader>
                  <CardTitle className="text-md flex items-center gap-2"><User className="w-4 h-4 text-primary"/> Ranking de Gastos por Usuário</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  {state.users.map(user => {
                      const userTotal = filteredExpenses.filter(e => e.userId === user.id).reduce((s, e) => s + e.amount, 0);
                      const percent = metrics.total > 0 ? (userTotal / metrics.total) * 100 : 0;
                      return (
                          <div key={user.id} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                  <span className="font-medium">{user.name}</span>
                                  <span className="font-bold">{formatCurrency(userTotal)}</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2">
                                  <div className="bg-primary h-2 rounded-full" style={{width: `${percent}%`}} />
                              </div>
                          </div>
                      )
                  })}
              </CardContent>
          </Card>

          <Card>
              <CardHeader>
                  <CardTitle className="text-md flex items-center gap-2"><Info className="w-4 h-4 text-primary"/> Insights do Período</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                      <strong>Frequência:</strong> Você realizou uma média de {(filteredExpenses.length / 30).toFixed(1)} gastos por dia no período selecionado.
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-800">
                      <strong>Atenção:</strong> A categoria <strong>{categoryChartData[0]?.name || 'N/A'}</strong> representa {((categoryChartData[0]?.value / metrics.total) * 100 || 0).toFixed(1)}% das suas despesas totais.
                  </div>
                  <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-sm text-purple-800">
                      <strong>Cartão de Crédito:</strong> {formatCurrency(filteredExpenses.filter(e => e.paymentMethod !== 'debito' && e.paymentMethod !== 'pix' && e.paymentMethod !== 'dinheiro').reduce((s, e) => s + e.amount, 0))} do seu gasto filtrado é dívida futura em cartões.
                  </div>
              </CardContent>
          </Card>
      </div>

      {/* Lista Detalhada com Scroll */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-md">Detalhamento dos Lançamentos</CardTitle>
          <Badge variant="secondary">{filteredExpenses.length} Itens encontrados</Badge>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-3 text-left">Data</th>
                    <th className="p-3 text-left">Descrição</th>
                    <th className="p-3 text-left">Categoria</th>
                    <th className="p-3 text-left">Pagamento</th>
                    <th className="p-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(e => (
                    <tr key={e.id} className="border-t hover:bg-muted/50 transition-colors">
                      <td className="p-3 text-muted-foreground">{format(new Date(e.date), 'dd/MM/yy')}</td>
                      <td className="p-3 font-medium">{e.description}</td>
                      <td className="p-3 uppercase text-[10px] tracking-wider">{e.category}</td>
                      <td className="p-3 text-muted-foreground italic">{e.paymentMethod}</td>
                      <td className="p-3 text-right font-bold">{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}