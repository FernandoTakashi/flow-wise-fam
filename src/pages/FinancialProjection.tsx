import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Calculator, Settings, DollarSign, ArrowUpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function FinancialProjection() {
  const { state, dispatch } = useFinance();
  const { toast } = useToast();
  
  // Estados configuráveis
  const [projectionMonths, setProjectionMonths] = useState(12);
  const [estimatedExtraIncome, setEstimatedExtraIncome] = useState(0); // Renda extra manual (freelas, bônus)
  const [showSettings, setShowSettings] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // 1. Saldo Atual (Caixa + Investimentos iniciais se quiser, mas aqui focamos em caixa livre)
  const getCurrentBalance = () => {
    const totalIncome = state.cashMovements
      .filter(movement => movement.type === 'income')
      .reduce((sum, movement) => sum + movement.amount, 0);
    
    const totalOutcome = state.cashMovements
      .filter(movement => movement.type === 'outcome')
      .reduce((sum, movement) => sum + movement.amount, 0);
    
    return state.settings.initialBalance + totalIncome - totalOutcome;
  };

  // 2. Total de Entradas Fixas (Automático do Banco)
  const getTotalFixedIncome = () => {
    return state.fixedIncomes.reduce((sum, income) => sum + income.amount, 0);
  };

  // 3. Total de Gastos Fixos (Automático do Banco)
  const getMonthlyFixedExpenses = () => {
    return state.fixedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  };

  // 4. Média de Gastos Variáveis (Histórico de 3 meses)
  const getAverageVariableExpenses = () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
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

    // Se não tiver dados, assume 0 ou um valor base seguro
    return monthsWithData > 0 ? totalVariable / monthsWithData : 0; 
  };

  const generateProjection = () => {
    const currentBalance = getCurrentBalance();
    const fixedIncome = getTotalFixedIncome();
    const monthlyFixedExpenses = getMonthlyFixedExpenses();
    const averageVariableExpenses = getAverageVariableExpenses();
    const monthlyYield = state.settings.monthlyYield / 100;

    const projectionData = [];
    let balance = currentBalance;

    for (let i = 0; i <= projectionMonths; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() + i);
      
      let yieldAmount = 0;

      if (i > 0) {
        // 1. Aplica rendimento sobre o saldo anterior
        yieldAmount = balance * monthlyYield;
        balance += yieldAmount;

        // 2. Soma Entradas (Fixa + Extra Manual)
        balance += fixedIncome + estimatedExtraIncome;

        // 3. Subtrai Saídas (Fixa + Variável Média)
        balance -= monthlyFixedExpenses;
        balance -= averageVariableExpenses;
      }

      projectionData.push({
        month: date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
        balance: Math.round(balance),
        fixedIncome: i === 0 ? 0 : fixedIncome,
        extraIncome: i === 0 ? 0 : estimatedExtraIncome,
        totalExpenses: i === 0 ? 0 : (monthlyFixedExpenses + averageVariableExpenses),
        yield: i === 0 ? 0 : Math.round(yieldAmount)
      });
    }

    return projectionData;
  };

  const projectionData = generateProjection();
  const currentBalance = getCurrentBalance();
  const finalBalance = projectionData[projectionData.length - 1].balance;
  const totalGrowth = finalBalance - currentBalance;
  const growthPercentage = currentBalance !== 0 ? (totalGrowth / currentBalance) * 100 : 0;

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
            Simulação baseada nas suas Entradas Fixas, Gastos e Rendimento
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
              <span>Configurações da Simulação</span>
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
                  max="60"
                  value={projectionMonths}
                  onChange={(e) => setProjectionMonths(parseInt(e.target.value) || 12)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extraIncome">Renda Extra Estimada (Manual)</Label>
                <Input
                  id="extraIncome"
                  type="number"
                  step="100"
                  placeholder="Ex: Freelas, Bônus..."
                  value={estimatedExtraIncome}
                  onChange={(e) => setEstimatedExtraIncome(parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">Valor somado além das Entradas Fixas cadastradas.</p>
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
                <p className="text-sm font-medium text-muted-foreground">Saldo em {projectionMonths} meses</p>
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
                <p className="text-sm font-medium text-muted-foreground">Crescimento Total</p>
                <p className={`text-2xl font-bold ${
                  totalGrowth >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {totalGrowth > 0 ? '+' : ''}{formatCurrency(totalGrowth)}
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
                <p className="text-sm font-medium text-muted-foreground">Rentabilidade (%)</p>
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
          <CardTitle>Evolução do Patrimônio</CardTitle>
          <CardDescription>
            Considerando Entradas Fixas, Estimativas de Gastos e Rendimentos compostos
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
            Visualize como o cálculo é feito em cada período
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 font-semibold">Mês</th>
                  <th className="text-right p-4 font-semibold text-green-600">Entradas Fixas</th>
                  <th className="text-right p-4 font-semibold text-blue-600">Renda Extra</th>
                  <th className="text-right p-4 font-semibold text-red-600">Total Despesas</th>
                  <th className="text-right p-4 font-semibold text-purple-600">Rendimento</th>
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
                          <Badge variant="outline" className="text-xs">Atual</Badge>
                        )}
                      </div>
                    </td>
                    <td className="text-right p-4">
                      {data.fixedIncome > 0 ? `+${formatCurrency(data.fixedIncome)}` : '-'}
                    </td>
                    <td className="text-right p-4">
                      {data.extraIncome > 0 ? `+${formatCurrency(data.extraIncome)}` : '-'}
                    </td>
                    <td className="text-right p-4">
                      {data.totalExpenses > 0 ? `-${formatCurrency(data.totalExpenses)}` : '-'}
                    </td>
                    <td className="text-right p-4">
                      {data.yield > 0 ? `+${formatCurrency(data.yield)}` : '-'}
                    </td>
                    <td className="text-right p-4 font-bold">
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
      <Card className="shadow-card bg-muted/20">
        <CardHeader>
          <CardTitle className="text-base">Entenda o Cálculo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-muted-foreground">
            <div>
              <h4 className="font-semibold text-foreground mb-2 flex items-center">
                <ArrowUpCircle className="w-4 h-4 mr-2 text-green-500" /> Receitas
              </h4>
              <ul className="space-y-1">
                <li>• Entradas Fixas (Banco): {formatCurrency(getTotalFixedIncome())}</li>
                <li>• Renda Extra (Manual): {formatCurrency(estimatedExtraIncome)}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2 flex items-center">
                <TrendingDown className="w-4 h-4 mr-2 text-red-500" /> Despesas
              </h4>
              <ul className="space-y-1">
                <li>• Gastos Fixos (Banco): {formatCurrency(getMonthlyFixedExpenses())}</li>
                <li>• Média Gastos Variáveis: {formatCurrency(getAverageVariableExpenses())}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2 flex items-center">
                <Calculator className="w-4 h-4 mr-2 text-purple-500" /> Rendimento
              </h4>
              <ul className="space-y-1">
                <li>• Taxa Mensal: {state.settings.monthlyYield}%</li>
                <li>• Juros Compostos aplicados sobre o saldo do mês anterior.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}