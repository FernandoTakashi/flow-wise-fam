import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Calculator, Settings, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function FinancialProjection() {
  const { state, dispatch } = useFinance();
  const { toast } = useToast();
  const [projectionMonths, setProjectionMonths] = useState(12);
  const [monthlyIncome, setMonthlyIncome] = useState(5000);
  const [showSettings, setShowSettings] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getCurrentBalance = () => {
    const totalIncome = state.cashMovements
      .filter(movement => movement.type === 'income')
      .reduce((sum, movement) => sum + movement.amount, 0);
    
    const totalOutcome = state.cashMovements
      .filter(movement => movement.type === 'outcome')
      .reduce((sum, movement) => sum + movement.amount, 0);
    
    return state.settings.initialBalance + totalIncome - totalOutcome;
  };

  const getMonthlyFixedExpenses = () => {
    return state.fixedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  };

  const getAverageVariableExpenses = () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    // Pegar gastos variáveis dos últimos 3 meses para calcular média
    const monthsToConsider = 3;
    let totalVariable = 0;
    let monthsWithData = 0;

    for (let i = 0; i < monthsToConsider; i++) {
      let month = currentMonth - i;
      let year = currentYear;
      
      if (month < 0) {
        month += 12;
        year -= 1;
      }

      const monthlyVariableExpenses = state.expenses
        .filter(expense => {
          const expenseDate = new Date(expense.date);
          return expenseDate.getMonth() === month && 
                 expenseDate.getFullYear() === year &&
                 expense.type === 'variavel';
        })
        .reduce((sum, expense) => sum + expense.amount, 0);

      if (monthlyVariableExpenses > 0) {
        totalVariable += monthlyVariableExpenses;
        monthsWithData++;
      }
    }

    return monthsWithData > 0 ? totalVariable / monthsWithData : 1000; // Default de R$ 1000 se não houver dados
  };

  const generateProjection = () => {
    const currentBalance = getCurrentBalance();
    const monthlyFixed = getMonthlyFixedExpenses();
    const averageVariable = getAverageVariableExpenses();
    const monthlyYield = state.settings.monthlyYield / 100;

    const projectionData = [];
    let balance = currentBalance;

    for (let i = 0; i <= projectionMonths; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() + i);
      
      if (i > 0) {
        // Aplicar rendimento
        balance = balance * (1 + monthlyYield);
        // Adicionar renda
        balance += monthlyIncome;
        // Subtrair gastos fixos
        balance -= monthlyFixed;
        // Subtrair gastos variáveis estimados
        balance -= averageVariable;
      }

      projectionData.push({
        month: date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
        balance: Math.round(balance),
        income: i === 0 ? 0 : monthlyIncome,
        fixedExpenses: i === 0 ? 0 : monthlyFixed,
        variableExpenses: i === 0 ? 0 : averageVariable,
        yield: i === 0 ? 0 : Math.round((balance - monthlyIncome + monthlyFixed + averageVariable) * monthlyYield)
      });
    }

    return projectionData;
  };

  const projectionData = generateProjection();
  const currentBalance = getCurrentBalance();
  const finalBalance = projectionData[projectionData.length - 1].balance;
  const totalGrowth = finalBalance - currentBalance;
  const growthPercentage = currentBalance > 0 ? (totalGrowth / currentBalance) * 100 : 0;

  const updateYield = (newYield: number) => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { monthlyYield: newYield }
    });
    
    toast({
      title: 'Configuração atualizada!',
      description: `Rendimento mensal definido como ${newYield}%`
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Projeção Financeira</h1>
          <p className="text-muted-foreground">
            Visualize a evolução prevista do seu saldo nos próximos meses
          </p>
        </div>
        <Button onClick={() => setShowSettings(!showSettings)} variant="outline">
          <Settings className="w-4 h-4 mr-2" />
          Configurações
        </Button>
      </div>

      {/* Configurações */}
      {showSettings && (
        <Card className="shadow-card animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="w-5 h-5 text-primary" />
              <span>Configurações da Projeção</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="months">Meses a Projetar</Label>
                <Input
                  id="months"
                  type="number"
                  min="3"
                  max="24"
                  value={projectionMonths}
                  onChange={(e) => setProjectionMonths(parseInt(e.target.value) || 12)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="income">Renda Mensal Estimada</Label>
                <Input
                  id="income"
                  type="number"
                  step="100"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="yield">Rendimento Mensal (%)</Label>
                <Input
                  id="yield"
                  type="number"
                  step="0.1"
                  value={state.settings.monthlyYield}
                  onChange={(e) => updateYield(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumo da Projeção */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Saldo Atual</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(currentBalance)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Saldo Projetado</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(finalBalance)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                totalGrowth >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
              }`}>
                {totalGrowth >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-green-500" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-500" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Crescimento</p>
                <p className={`text-2xl font-bold ${
                  totalGrowth >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatCurrency(totalGrowth)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Calculator className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Crescimento (%)</p>
                <p className={`text-2xl font-bold ${
                  growthPercentage >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {growthPercentage.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Projeção */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Evolução do Saldo Projetado</CardTitle>
          <CardDescription>
            Gráfico mostrando a evolução prevista do saldo para os próximos {projectionMonths} meses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projectionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => [formatCurrency(value as number), 'Saldo']}
                  labelStyle={{ color: 'var(--foreground)' }}
                  contentStyle={{
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#8884d8"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  name="Saldo Projetado"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabela Detalhada */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Detalhamento Mês a Mês</CardTitle>
          <CardDescription>
            Breakdown detalhado da projeção para cada mês
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 font-semibold">Mês</th>
                  <th className="text-right p-4 font-semibold">Renda</th>
                  <th className="text-right p-4 font-semibold">Gastos Fixos</th>
                  <th className="text-right p-4 font-semibold">Gastos Variáveis</th>
                  <th className="text-right p-4 font-semibold">Rendimento</th>
                  <th className="text-right p-4 font-semibold">Saldo Final</th>
                </tr>
              </thead>
              <tbody>
                {projectionData.map((data, index) => (
                  <tr key={index} className={`border-b border-border ${
                    index === 0 ? 'bg-muted/30' : 'hover:bg-muted/50'
                  }`}>
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{data.month}</span>
                        {index === 0 && (
                          <Badge variant="outline" className="text-xs">
                            Atual
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="text-right p-4 text-green-600">
                      {data.income > 0 ? `+${formatCurrency(data.income)}` : '-'}
                    </td>
                    <td className="text-right p-4 text-red-600">
                      {data.fixedExpenses > 0 ? `-${formatCurrency(data.fixedExpenses)}` : '-'}
                    </td>
                    <td className="text-right p-4 text-red-600">
                      {data.variableExpenses > 0 ? `-${formatCurrency(data.variableExpenses)}` : '-'}
                    </td>
                    <td className="text-right p-4 text-blue-600">
                      {data.yield > 0 ? `+${formatCurrency(data.yield)}` : '-'}
                    </td>
                    <td className="text-right p-4 font-semibold">
                      {formatCurrency(data.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Premissas */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Premissas da Projeção</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">Receitas</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Renda mensal estimada: {formatCurrency(monthlyIncome)}</li>
                <li>• Rendimento mensal: {state.settings.monthlyYield}%</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Despesas</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Gastos fixos mensais: {formatCurrency(getMonthlyFixedExpenses())}</li>
                <li>• Média gastos variáveis: {formatCurrency(getAverageVariableExpenses())}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}