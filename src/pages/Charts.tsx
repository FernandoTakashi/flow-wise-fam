import { useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, 
  BarChart3, 
  PieChart as PieChartIcon, 
  Calendar,
  DollarSign
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Charts() {
  const { state, getCurrentBalance } = useFinance();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Cores do tema
  const colors = {
    primary: 'hsl(142, 76%, 36%)',
    secondary: 'hsl(213, 94%, 68%)',
    accent: 'hsl(262, 83%, 58%)',
    warning: 'hsl(38, 92%, 50%)',
    destructive: 'hsl(0, 84%, 60%)',
    success: 'hsl(142, 76%, 36%)'
  };

  const categoryColors = [
    colors.primary,
    colors.secondary,
    colors.accent,
    colors.warning,
    colors.destructive,
    '#8884d8',
    '#82ca9d',
    '#ffc658'
  ];

  // 1. Evolução mensal dos gastos (últimos 6 meses)
  const monthlyExpensesData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date()
    });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const monthlyExpenses = state.expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= monthStart && expenseDate <= monthEnd;
      });

      const total = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      
      return {
        month: format(month, 'MMM/yy', { locale: ptBR }),
        valor: total
      };
    });
  }, [state.expenses]);

  // 2. Gastos por categoria (mês atual)
  const categoryData = useMemo(() => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const currentMonthExpenses = state.expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
    });

    const categories = [
      { key: 'alimentacao', label: 'Alimentação' },
      { key: 'transporte', label: 'Transporte' },
      { key: 'lazer', label: 'Lazer' },
      { key: 'saude', label: 'Saúde' },
      { key: 'educacao', label: 'Educação' },
      { key: 'moradia', label: 'Moradia' },
      { key: 'vestuario', label: 'Vestuário' },
      { key: 'outros', label: 'Outros' }
    ];

    return categories.map(category => {
      const categoryExpenses = currentMonthExpenses.filter(expense => expense.category === category.key);
      const total = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      
      return {
        categoria: category.label,
        valor: total
      };
    }).filter(item => item.valor > 0);
  }, [state.expenses]);

  // 3. Proporção entre tipos de gasto
  const typeData = useMemo(() => {
    const types = [
      { key: 'fixo', label: 'Fixos' },
      { key: 'variavel', label: 'Variáveis' },
      { key: 'cartao_credito', label: 'Cartão de Crédito' }
    ];

    return types.map(type => {
      const typeExpenses = state.expenses.filter(expense => expense.type === type.key);
      const total = typeExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      
      return {
        tipo: type.label,
        valor: total
      };
    }).filter(item => item.valor > 0);
  }, [state.expenses]);

  // 4. Evolução do saldo (últimos 6 meses)
  const balanceEvolutionData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date()
    });

    let runningBalance = state.settings.initialBalance;
    
    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      // Movimentações do mês
      const monthMovements = state.cashMovements.filter(movement => {
        const movementDate = new Date(movement.date);
        return movementDate >= monthStart && movementDate <= monthEnd;
      });

      const monthIncome = monthMovements
        .filter(m => m.type === 'income')
        .reduce((sum, m) => sum + m.amount, 0);
      
      const monthOutcome = monthMovements
        .filter(m => m.type === 'outcome')
        .reduce((sum, m) => sum + m.amount, 0);

      runningBalance += monthIncome - monthOutcome;

      // Aplicar rendimento
      const projectedBalance = runningBalance * (1 + state.settings.monthlyYield / 100);
      
      return {
        month: format(month, 'MMM/yy', { locale: ptBR }),
        saldo: runningBalance,
        projecao: projectedBalance
      };
    });
  }, [state.cashMovements, state.settings]);

  // 5. Gastos por usuário
  const userExpensesData = useMemo(() => {
    return state.users.map(user => {
      const userExpenses = state.expenses.filter(expense => expense.userId === user.id);
      const userMovements = state.cashMovements.filter(movement => movement.userId === user.id);
      
      const totalExpenses = userExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const totalIncome = userMovements
        .filter(m => m.type === 'income')
        .reduce((sum, m) => sum + m.amount, 0);
      
      return {
        usuario: user.name,
        gastos: totalExpenses,
        entradas: totalIncome
      };
    });
  }, [state.expenses, state.cashMovements, state.users]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Gráficos e Análises</h1>
        <p className="text-muted-foreground">
          Visualização gráfica dos dados financeiros
        </p>
      </div>

      {/* Primeira linha de gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolução mensal dos gastos */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span>Evolução Mensal dos Gastos</span>
            </CardTitle>
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyExpensesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Gastos']}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="valor" 
                  stroke={colors.primary} 
                  strokeWidth={3}
                  dot={{ fill: colors.primary, strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gastos por categoria */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <span>Gastos por Categoria</span>
            </CardTitle>
            <CardDescription>Mês atual</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="categoria" />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Valor']}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }}
                />
                <Bar dataKey="valor" fill={colors.secondary} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Segunda linha de gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Proporção entre tipos de gasto */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <PieChartIcon className="w-5 h-5 text-primary" />
              <span>Tipos de Gasto</span>
            </CardTitle>
            <CardDescription>Distribuição por tipo</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ tipo, value }) => `${tipo}: ${formatCurrency(value)}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="valor"
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={categoryColors[index % categoryColors.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Valor']}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Evolução do saldo */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <span>Evolução do Saldo</span>
            </CardTitle>
            <CardDescription>Saldo real vs projeção com rendimento</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={balanceEvolutionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    formatCurrency(value), 
                    name === 'saldo' ? 'Saldo Real' : 'Projeção'
                  ]}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="saldo" 
                  stroke={colors.primary} 
                  strokeWidth={3}
                  name="Saldo Real"
                  dot={{ fill: colors.primary, strokeWidth: 2, r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="projecao" 
                  stroke={colors.accent} 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Projeção"
                  dot={{ fill: colors.accent, strokeWidth: 2, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de gastos/entradas por usuário */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span>Gastos vs Entradas por Usuário</span>
          </CardTitle>
          <CardDescription>Comparação de movimentações por usuário</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={userExpensesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="usuario" />
              <YAxis tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  formatCurrency(value), 
                  name === 'gastos' ? 'Gastos' : 'Entradas'
                ]}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))' 
                }}
              />
              <Legend />
              <Bar dataKey="entradas" fill={colors.success} name="Entradas" />
              <Bar dataKey="gastos" fill={colors.destructive} name="Gastos" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {categoryData.length === 0 && typeData.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Sem dados para exibir</h3>
            <p className="text-muted-foreground">
              Cadastre alguns gastos para visualizar os gráficos
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}