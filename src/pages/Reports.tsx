import { useState, useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Download, Filter, RefreshCw, TrendingUp, TrendingDown,
  Wallet, CreditCard, ChevronDown, ChevronUp, Search, Calendar
} from 'lucide-react';
import { format, subMonths, isSameMonth, eachDayOfInterval, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ExpenseCategory } from '@/types';
import { 
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart, Line
} from 'recharts';

interface FilterState {
  startDate: string;
  endDate: string;
  category: string;
  paymentMethod: string;
  userId: string;
  description: string;
}

export default function Reports() {
  const { state, getActiveFixedExpenses, getActiveFixedIncomes } = useFinance();
  const [showFilters, setShowFilters] = useState(false);

  // Filtro inicial: Mês atual completo
  const [filters, setFilters] = useState<FilterState>({
    startDate: format(new Date().setDate(1), 'yyyy-MM-dd'), 
    endDate: format(new Date(), 'yyyy-MM-dd'),
    category: '',
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

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // --- 1. FILTRAGEM UNIFICADA ---
  const filteredData = useMemo(() => {
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    // Ajusta para cobrir o dia inteiro na comparação
    const interval = { start: startOfDay(start), end: endOfDay(end) };

    // Despesas Filtradas
    const expenses = state.expenses.filter(e => {
        const d = new Date(e.date);
        if (!isWithinInterval(d, interval)) return false;
        if (filters.category && e.category !== filters.category) return false;
        if (filters.paymentMethod && e.paymentMethod !== filters.paymentMethod) return false;
        if (filters.userId && e.userId !== filters.userId) return false;
        if (filters.description && !e.description.toLowerCase().includes(filters.description.toLowerCase())) return false;
        return true;
    });

    // Receitas Filtradas (Movimentações de caixa do tipo 'income')
    // Nota: Receitas fixas são calculadas separadamente na visão mensal, aqui pegamos o realizado
    const incomes = state.cashMovements.filter(m => {
        const d = new Date(m.date);
        return m.type === 'income' && isWithinInterval(d, interval);
    });

    return { expenses, incomes };
  }, [state.expenses, state.cashMovements, filters]);

  // --- 2. KPIS FINANCEIROS ---
  const metrics = useMemo(() => {
    // Total Despesas (Variáveis filtradas + Fixas proporcionais ao período não é trivial, 
    // então vamos focar no que foi LANÇADO como expense + Pagamentos de Fixas Realizados)
    
    const totalExpenses = filteredData.expenses.reduce((acc, e) => acc + Number(e.amount), 0);
    
    // Total Receitas (Caixa + Fixas Recebidas nesse período)
    const fixedReceiptsVal = state.fixedReceipts
        .filter(r => isWithinInterval(new Date(r.receivedAt), { start: startOfDay(new Date(filters.startDate)), end: endOfDay(new Date(filters.endDate)) }))
        .reduce((acc, r) => acc + Number(r.amount), 0);
        
    const totalIncome = filteredData.incomes.reduce((acc, i) => acc + Number(i.amount), 0) + fixedReceiptsVal;

    const balance = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

    return { totalExpenses, totalIncome, balance, savingsRate };
  }, [filteredData, state.fixedReceipts, filters]);

  // --- 3. GRÁFICO: EVOLUÇÃO MENSAL (Entradas vs Saídas) ---
  const evolutionData = useMemo(() => {
    // Pega os últimos 6 meses até a data final do filtro
    const end = new Date(filters.endDate);
    const start = subMonths(end, 5);
    const months = eachDayOfInterval({ start, end }).filter(d => d.getDate() === 1); // Pega o dia 1 de cada mês

    return months.map(monthDate => {
        const m = monthDate.getMonth();
        const y = monthDate.getFullYear();

        // Despesas Variáveis do mês
        const varExpenses = state.expenses
            .filter(e => isSameMonth(new Date(e.date), monthDate))
            .reduce((sum, e) => sum + Number(e.amount), 0);
        
        // Despesas Fixas (Ativas naquele mês)
        const fixExpenses = getActiveFixedExpenses(m, y)
            .reduce((sum, f) => sum + Number(f.amount), 0);

        // Receitas (Caixa + Fixas Previstas/Realizadas)
        const cashIn = state.cashMovements
            .filter(mov => mov.type === 'income' && isSameMonth(new Date(mov.date), monthDate))
            .reduce((sum, mov) => sum + Number(mov.amount), 0);
        
        const fixIn = getActiveFixedIncomes(m, y)
            .reduce((sum, i) => sum + Number(i.amount), 0);

        return {
            name: format(monthDate, 'MMM', { locale: ptBR }).toUpperCase(),
            Despesas: varExpenses + fixExpenses,
            Receitas: cashIn + fixIn,
            Saldo: (cashIn + fixIn) - (varExpenses + fixExpenses)
        };
    });
  }, [state.expenses, state.cashMovements, filters.endDate, getActiveFixedExpenses, getActiveFixedIncomes]);

  // --- 4. GRÁFICO: GASTO ACUMULADO (Diário no Período) ---
  const dailyTrendData = useMemo(() => {
    const days = eachDayOfInterval({ 
        start: new Date(filters.startDate), 
        end: new Date(filters.endDate) 
    });

    let cumulative = 0;
    return days.map(day => {
        const dayTotal = filteredData.expenses
            .filter(e => format(new Date(e.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))
            .reduce((sum, e) => sum + Number(e.amount), 0);
        
        cumulative += dayTotal;
        return {
            day: format(day, 'dd/MM'),
            accumulated: cumulative,
            daily: dayTotal
        };
    });
  }, [filteredData.expenses, filters.startDate, filters.endDate]);

  // --- 5. GRÁFICO: CATEGORIAS E MÉTODOS ---
  const categoryData = useMemo(() => {
    return categories.map(cat => ({
        name: cat.label,
        value: filteredData.expenses.filter(e => e.category === cat.value).reduce((acc, e) => acc + Number(e.amount), 0)
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredData.expenses]);

  const methodData = useMemo(() => {
    const methods = Array.from(new Set(filteredData.expenses.map(e => e.paymentMethod)));
    return methods.map(method => ({
        name: method,
        value: filteredData.expenses.filter(e => e.paymentMethod === method).reduce((acc, e) => acc + Number(e.amount), 0)
    })).sort((a, b) => b.value - a.value);
  }, [filteredData.expenses]);

  // --- EXPORTAR ---
  const exportToCsv = () => {
    const headers = ['Data', 'Descricao', 'Categoria', 'Metodo', 'Valor', 'Usuario'];
    const rows = filteredData.expenses.map(e => [
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
    a.download = `relatorio-${filters.startDate}-a-${filters.endDate}.csv`;
    a.click();
  };

  const clearFilters = () => {
    setFilters({ 
        startDate: format(new Date().setDate(1), 'yyyy-MM-dd'), // Volta pro início do mês atual
        endDate: format(new Date(), 'yyyy-MM-dd'),
        category: '', paymentMethod: '', userId: '', description: '' 
    });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      
      {/* HEADER & ACTIONS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Análise estratégica das suas finanças</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" onClick={clearFilters} className="flex-1 md:flex-none">
                <RefreshCw className="w-4 h-4 mr-2" /> Resetar
            </Button>
            <Button onClick={exportToCsv} className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700">
                <Download className="w-4 h-4 mr-2" /> Exportar
            </Button>
        </div>
      </div>

      {/* FILTROS AVANÇADOS */}
      <Card className="shadow-card border-l-4 border-l-primary">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/5 transition-colors" onClick={() => setShowFilters(!showFilters)}>
            <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-medium">Filtros de Análise</CardTitle>
            </div>
            {showFilters ? <ChevronUp className="w-4 h-4 text-muted-foreground"/> : <ChevronDown className="w-4 h-4 text-muted-foreground"/>}
        </CardHeader>
        
        {showFilters && (
            <CardContent className="p-4 pt-0 animate-in slide-in-from-top-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                    <div className="space-y-1">
                        <Label className="text-xs">De</Label>
                        <div className="relative">
                            <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input type="date" className="pl-9 h-9" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Até</Label>
                        <div className="relative">
                            <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input type="date" className="pl-9 h-9" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Categoria</Label>
                        <Select value={filters.category} onValueChange={v => setFilters({...filters, category: v === 'all' ? '' : v})}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas</SelectItem>
                                {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Busca</Label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Uber, Mercado..." className="pl-9 h-9" value={filters.description} onChange={e => setFilters({...filters, description: e.target.value})} />
                        </div>
                    </div>
                </div>
            </CardContent>
        )}
      </Card>

      {/* KPI CARDS - NOVOS INDICADORES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
            <CardContent className="p-4 flex flex-col justify-between h-full">
                <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-500" /> Receita (Período)
                </span>
                <span className="text-xl font-bold text-emerald-600">{formatCurrency(metrics.totalIncome)}</span>
            </CardContent>
        </Card>
        <Card className="shadow-sm">
            <CardContent className="p-4 flex flex-col justify-between h-full">
                <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-500" /> Despesa (Período)
                </span>
                <span className="text-xl font-bold text-red-600">{formatCurrency(metrics.totalExpenses)}</span>
            </CardContent>
        </Card>
        <Card className={`shadow-sm border-l-4 ${metrics.balance >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
            <CardContent className="p-4 flex flex-col justify-between h-full">
                <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <Wallet className="w-3 h-3" /> Resultado
                </span>
                <span className={`text-xl font-bold ${metrics.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatCurrency(metrics.balance)}
                </span>
            </CardContent>
        </Card>
        <Card className="shadow-sm bg-primary/5 border-primary/10">
            <CardContent className="p-4 flex flex-col justify-between h-full">
                <span className="text-xs font-medium text-primary uppercase">Taxa de Economia</span>
                <div className="flex items-end gap-2">
                    <span className="text-2xl font-bold text-primary">{metrics.savingsRate.toFixed(1)}%</span>
                    <span className="text-[10px] text-muted-foreground mb-1">da renda</span>
                </div>
            </CardContent>
        </Card>
      </div>

      {/* DASHBOARD GRÁFICO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. EVOLUÇÃO MENSAL (COMPARATIVO) */}
        <Card className="shadow-card lg:col-span-2">
            <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-medium">Fluxo de Caixa (6 Meses)</CardTitle>
                <CardDescription>Comparativo entre Entradas e Saídas</CardDescription>
            </CardHeader>
            <CardContent className="p-4 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={evolutionData} margin={{top: 20, right: 20, bottom: 0, left: 0}}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} dy={10} />
                        <YAxis hide />
                        <Tooltip 
                            contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                            formatter={(value: any) => formatCurrency(value)}
                        />
                        <Legend verticalAlign="top" height={36} iconType="circle"/>
                        <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                        <Line type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} />
                    </ComposedChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>

        {/* 2. TENDÊNCIA DE GASTO DIÁRIO (NOVO) */}
        <Card className="shadow-card">
            <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-medium">Velocidade de Gasto</CardTitle>
                <CardDescription>Acumulado diário no período selecionado</CardDescription>
            </CardHeader>
            <CardContent className="p-4 h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyTrendData}>
                        <defs>
                            <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="day" hide />
                        <Tooltip 
                            labelStyle={{color: '#6b7280'}}
                            contentStyle={{borderRadius: '8px', border: 'none', fontSize: '12px'}}
                            formatter={(val: any) => [formatCurrency(val), "Acumulado"]}
                        />
                        <Area type="monotone" dataKey="accumulated" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorTrend)" />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>

        {/* 3. CATEGORIAS (DONUT) */}
        <Card className="shadow-card">
            <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-medium">Gastos por Categoria</CardTitle>
                <CardDescription>Onde você mais gastou</CardDescription>
            </CardHeader>
            <CardContent className="p-4 flex flex-col md:flex-row items-center gap-4">
                <div className="h-[200px] w-full md:w-1/2">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={categoryData}
                                cx="50%" cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {categoryData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                ))}
                            </Pie>
                            <Tooltip formatter={(v: any) => formatCurrency(v)} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                {/* LEGENDA OTIMIZADA */}
                <div className="w-full md:w-1/2 space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {categoryData.map((entry, index) => (
                        <div key={index} className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[index % COLORS.length]}} />
                                <span className="font-medium truncate max-w-[100px]">{entry.name}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="font-bold">{formatCurrency(entry.value)}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {((entry.value / metrics.totalExpenses) * 100).toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>

        {/* 4. MÉTODOS DE PAGAMENTO (NOVO) */}
        <Card className="shadow-card lg:col-span-2">
             <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-medium">Uso por Método de Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
                <div className="space-y-4">
                    {methodData.map((item, index) => (
                        <div key={index} className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="flex items-center gap-2 font-medium">
                                    <CreditCard className="w-3 h-3 text-muted-foreground" />
                                    {item.name}
                                </span>
                                <span>{formatCurrency(item.value)}</span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-primary/80 transition-all duration-500" 
                                    style={{ width: `${(item.value / metrics.totalExpenses) * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>

      </div>

      {/* LISTA DETALHADA */}
      <Card className="shadow-card overflow-hidden">
        <CardHeader className="p-4 bg-muted/20">
            <CardTitle className="text-sm font-bold">Extrato Detalhado do Filtro</CardTitle>
        </CardHeader>
        <div className="max-h-[400px] overflow-y-auto">
            {filteredData.expenses.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                    Nenhum lançamento encontrado para este filtro.
                </div>
            ) : (
                <table className="w-full text-xs md:text-sm text-left">
                    <thead className="bg-muted sticky top-0 z-10 text-muted-foreground font-medium">
                        <tr>
                            <th className="p-3">Data</th>
                            <th className="p-3">Descrição</th>
                            <th className="p-3 hidden md:table-cell">Categoria</th>
                            <th className="p-3 text-right">Valor</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredData.expenses
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((e) => (
                            <tr key={e.id} className="hover:bg-muted/5 transition-colors">
                                <td className="p-3 whitespace-nowrap text-muted-foreground">
                                    {format(new Date(e.date), 'dd/MM/yy')}
                                </td>
                                <td className="p-3">
                                    <div className="font-medium line-clamp-1">{e.description}</div>
                                    <div className="text-[10px] text-muted-foreground md:hidden">{e.category} • {e.paymentMethod}</div>
                                </td>
                                <td className="p-3 hidden md:table-cell">
                                    <Badge variant="secondary" className="text-[10px] font-normal">{e.category}</Badge>
                                </td>
                                <td className="p-3 text-right font-semibold">
                                    {formatCurrency(e.amount)}
                                </td>
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