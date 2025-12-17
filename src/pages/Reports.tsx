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
  BarChart3, PieChart as PieChartIcon, TrendingUp, Info, ChevronDown, ChevronUp
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
  
  // Estado para controlar visibilidade dos filtros no mobile
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    startDate: format(subMonths(new Date(), 1), 'yyyy-MM-01'), 
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

  // 1. Filtragem
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

  // 2. Métricas
  const metrics = useMemo(() => {
    const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const count = filteredExpenses.length;
    const avg = count > 0 ? total / count : 0;
    const maxExpense = filteredExpenses.length > 0 
      ? [...filteredExpenses].sort((a, b) => b.amount - a.amount)[0] 
      : null;
    return { total, count, avg, maxExpense };
  }, [filteredExpenses]);

  // 3. Evolução Mensal
  const monthlyEvolutionData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date()
    });

    return months.map(m => {
      const monthStr = format(m, 'MMM', { locale: ptBR }); // Mês abreviado para caber no mobile
      const varTotal = state.expenses
        .filter(e => isSameMonth(new Date(e.date), m))
        .reduce((sum, e) => sum + e.amount, 0);
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

  // 4. Pizza (Categorias)
  const categoryChartData = useMemo(() => {
    return categories.map(cat => {
      const total = filteredExpenses
        .filter(e => e.category === cat.value)
        .reduce((sum, e) => sum + e.amount, 0);
      return { name: cat.label, value: total };
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

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
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Análise de {filteredExpenses.length} lançamentos</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" onClick={clearFilters} className="flex-1 md:flex-none h-10"><RefreshCw className="w-4 h-4 mr-2" /> Limpar</Button>
            <Button onClick={exportToCsv} className="flex-1 md:flex-none h-10 bg-emerald-600 hover:bg-emerald-700"><Download className="w-4 h-4 mr-2" /> CSV</Button>
        </div>
      </div>

      {/* FILTROS (Colapsável no Mobile) */}
      <Card className="shadow-card border-primary/10">
        <CardHeader className="pb-3 p-4">
          <div className="flex items-center justify-between" onClick={() => setShowFilters(!showFilters)}>
             <CardTitle className="text-base flex items-center gap-2 cursor-pointer select-none w-full">
                <Filter className="w-4 h-4 text-primary" /> Filtros
             </CardTitle>
             <Button variant="ghost" size="sm" className="md:hidden">
                {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
             </Button>
          </div>
        </CardHeader>
        
        {/* Mostra sempre no desktop (md:block), condicional no mobile */}
        <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
            <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2">
                <div className="space-y-1.5">
                <Label>Período</Label>
                <div className="flex gap-2">
                    <Input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="text-xs h-10" />
                    <Input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="text-xs h-10" />
                </div>
                </div>
                <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={filters.category} onValueChange={v => setFilters({...filters, category: v})}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                    <SelectItem value=" ">Todas</SelectItem>
                    {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                </div>
                <div className="space-y-1.5">
                <Label>Usuário</Label>
                <Select value={filters.userId} onValueChange={v => setFilters({...filters, userId: v})}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                    <SelectItem value=" ">Todos</SelectItem>
                    {state.users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                </div>
                <div className="space-y-1.5">
                <Label>Busca</Label>
                <div className="relative">
                    <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Descrição..." className="pl-8 h-10" value={filters.description} onChange={e => setFilters({...filters, description: e.target.value})} />
                </div>
                </div>
            </div>
            </CardContent>
        </div>
      </Card>

      {/* KPI GRID (2 Colunas Mobile) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-primary/5 border-primary/20 col-span-2 md:col-span-1">
          <CardContent className="p-4 md:p-6">
            <p className="text-xs font-medium text-muted-foreground">Total Filtrado</p>
            <p className="text-xl md:text-2xl font-bold text-primary">{formatCurrency(metrics.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 md:p-6">
            <p className="text-xs font-medium text-muted-foreground">Ticket Médio</p>
            <p className="text-xl md:text-2xl font-bold">{formatCurrency(metrics.avg)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 md:p-6">
            <p className="text-xs font-medium text-muted-foreground">Maior Gasto</p>
            <p className="text-lg md:text-xl font-bold truncate">{metrics.maxExpense ? formatCurrency(metrics.maxExpense.amount) : '---'}</p>
            <p className="text-[10px] text-muted-foreground truncate">{metrics.maxExpense?.description}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100 col-span-2 md:col-span-1">
          <CardContent className="p-4 md:p-6">
            <p className="text-xs font-medium text-emerald-800">Saldo Atual</p>
            <p className="text-xl md:text-2xl font-bold text-emerald-600">{formatCurrency(getCurrentBalance())}</p>
          </CardContent>
        </Card>
      </div>

      {/* GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Gráfico Barras (Sem Eixo Y no Mobile) */}
        <Card className="lg:col-span-2 shadow-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary"/> Evolução 6 Meses</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px] md:h-[350px] p-2 md:p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyEvolutionData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                <YAxis hide />
                <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px'}} 
                    formatter={(v) => formatCurrency(Number(v))} 
                />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                <Bar dataKey="Fixo" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} barSize={30} />
                <Bar dataKey="Variavel" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico Pizza (Legenda Externa Personalizada) */}
        <Card className="shadow-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base flex items-center gap-2"><PieChartIcon className="w-4 h-4 text-primary"/> Categorias</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                    data={categoryChartData}
                    cx="50%" cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    >
                    {categoryChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                </PieChart>
                </ResponsiveContainer>
            </div>
            
            {/* LEGENDA CUSTOMIZADA (Mobile Friendly) */}
            <div className="mt-4 space-y-2 max-h-[150px] overflow-y-auto pr-1">
                {categoryChartData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: COLORS[i % COLORS.length]}} />
                            <span className="truncate max-w-[120px] text-muted-foreground">{d.name}</span>
                        </div>
                        <span className="font-medium">{formatCurrency(d.value)}</span>
                    </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TABELA / LISTA DE CARDS */}
      <Card className="shadow-card">
        <CardHeader className="p-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Detalhamento</CardTitle>
          <Badge variant="secondary" className="text-[10px]">{filteredExpenses.length} Itens</Badge>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          
          {/* VERSÃO MOBILE: LISTA DE CARDS */}
          <div className="md:hidden divide-y divide-border">
             {filteredExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(e => (
                 <div key={e.id} className="p-4 flex flex-col gap-1">
                     <div className="flex justify-between items-start">
                         <span className="font-semibold text-sm line-clamp-1">{e.description}</span>
                         <span className="font-bold text-sm">{formatCurrency(e.amount)}</span>
                     </div>
                     <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                         <div className="flex gap-2 items-center">
                             <Badge variant="outline" className="text-[10px] h-5 px-1 uppercase">{e.category}</Badge>
                             <span>{format(new Date(e.date), 'dd/MM')}</span>
                         </div>
                         <span className="italic">{e.paymentMethod}</span>
                     </div>
                 </div>
             ))}
          </div>

          {/* VERSÃO DESKTOP: TABELA TRADICIONAL */}
          <div className="hidden md:block rounded-md border overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="p-3 text-left font-medium">Data</th>
                    <th className="p-3 text-left font-medium">Descrição</th>
                    <th className="p-3 text-left font-medium">Categoria</th>
                    <th className="p-3 text-left font-medium">Pagamento</th>
                    <th className="p-3 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(e => (
                    <tr key={e.id} className="hover:bg-muted/50 transition-colors">
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