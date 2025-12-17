import { useState, useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Calculator, Settings, DollarSign, ArrowUpCircle, Wallet, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function FinancialProjection() {
  const { state, dispatch, getDashboardData, getTotalInvestments } = useFinance();
  const { toast } = useToast();
  
  // Configuração fixa de "Dados Reais"
  const projectionMonths = 12; 
  const { month: selectedMonth, year: selectedYear } = state.selectedMonth;

  // Estados apenas para controle visual
  const [showSettings, setShowSettings] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // ---------------------------------------------------------
  // 1. DADOS REAIS (PONTO DE PARTIDA)
  // ---------------------------------------------------------
  
  const dashboardData = getDashboardData();
  const startCashBalance = dashboardData.projectedBalance;
  const startInvestedBalance = getTotalInvestments();

  // ---------------------------------------------------------
  // 2. MÉDIAS E FIXOS (AUTOMÁTICOS)
  // ---------------------------------------------------------

  const totalFixedIncome = useMemo(() => {
    return state.fixedIncomes.reduce((sum, income) => sum + Number(income.amount), 0);
  }, [state.fixedIncomes]);

  const totalFixedExpenses = useMemo(() => {
    return state.fixedExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  }, [state.fixedExpenses]);

  const averageVariableConsumption = useMemo(() => {
    let checkMonth = selectedMonth - 1; 
    let checkYear = selectedYear;
    const monthsToConsider = 3;
    let totalVariable = 0;
    let count = 0;

    for (let i = 0; i < monthsToConsider; i++) {
      if (checkMonth < 0) {
        checkMonth += 12;
        checkYear -= 1;
      }
      const monthlySum = state.expenses
        .filter(e => {
          const d = new Date(e.date);
          return d.getMonth() === checkMonth && d.getFullYear() === checkYear && 
                 e.type === 'variavel'; 
        })
        .reduce((sum, e) => sum + Number(e.amount), 0);

      if (monthlySum > 0) {
        totalVariable += monthlySum;
        count++;
      }
      checkMonth--;
    }
    return count > 0 ? totalVariable / count : 0;
  }, [state.expenses, selectedMonth, selectedYear]);

  // ---------------------------------------------------------
  // 3. PROJEÇÃO AUTOMÁTICA
  // ---------------------------------------------------------
  
  const projectionData = useMemo(() => {
    const data = [];
    const monthlyYieldRate = (Number(state.settings.monthlyYield) || 0) / 100;

    let accumulatedInvested = startInvestedBalance; 
    let accumulatedCash = startCashBalance;

    for (let i = 0; i <= projectionMonths; i++) {
      const currentProjectionDate = new Date(selectedYear, selectedMonth + i, 1);
      const loopMonth = currentProjectionDate.getMonth();
      const loopYear = currentProjectionDate.getFullYear();
      
      let yieldAmount = 0;
      let monthIncome = 0;
      let monthExpenses = 0;

      if (i === 0) {
        monthIncome = dashboardData.totalIncome;
        monthExpenses = dashboardData.totalFixedExpenses + dashboardData.variableExpenses + dashboardData.pendingCreditCards;
        if (accumulatedInvested > 0) {
           yieldAmount = accumulatedInvested * monthlyYieldRate;
        }
      } else {
        if (accumulatedInvested > 0) {
          yieldAmount = accumulatedInvested * monthlyYieldRate;
        }
        accumulatedInvested += yieldAmount;

        monthIncome = totalFixedIncome; 

        const futureCardInstallments = state.expenses
          .filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === loopMonth && d.getFullYear() === loopYear;
          })
          .reduce((sum, e) => sum + Number(e.amount), 0);

        monthExpenses = totalFixedExpenses + futureCardInstallments + averageVariableConsumption;
        accumulatedCash = accumulatedCash + monthIncome - monthExpenses;
      }

      data.push({
        month: currentProjectionDate.toLocaleDateString('pt-BR', { month: 'long', year: '2-digit' }), // "janeiro de 25"
        shortMonth: currentProjectionDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), // "jan. de 25"
        fullDate: currentProjectionDate,
        balance: Math.round(accumulatedInvested + accumulatedCash),
        invested: Math.round(accumulatedInvested),
        cash: Math.round(accumulatedCash),
        fixedIncome: monthIncome,
        totalExpenses: monthExpenses,
        yield: Math.round(yieldAmount),
        isCurrent: i === 0
      });
    }

    return data;
  }, [state.expenses, state.settings.monthlyYield, state.fixedIncomes, state.fixedExpenses, state.investments, getDashboardData, getTotalInvestments, startCashBalance, startInvestedBalance, selectedMonth, selectedYear, totalFixedIncome, totalFixedExpenses, averageVariableConsumption, dashboardData]);

  const startTotalPatrimony = (projectionData[0]?.balance || 0);
  const finalBalance = (projectionData[projectionData.length - 1]?.balance || 0);
  const totalGrowth = finalBalance - startTotalPatrimony;
  const growthPercentage = startTotalPatrimony !== 0 
    ? (totalGrowth / Math.abs(startTotalPatrimony)) * 100 
    : (finalBalance > 0 ? 100 : 0);

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-24 md:pb-10">
      {/* HEADER ADAPTÁVEL */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-primary" />
          Projeção Financeira
        </h1>
        <p className="text-sm text-muted-foreground">
          Evolução real baseada em seus cadastros a partir de <strong>{monthNames[selectedMonth]}/{selectedYear}</strong>
        </p>
      </div>

      {/* CARDS KPI - GRID 2x2 no Mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4 md:p-6 flex flex-col justify-between h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-full text-blue-500">
                <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-xs md:text-sm font-medium text-muted-foreground">Hoje</span>
            </div>
            <p className="text-lg md:text-2xl font-bold">{formatCurrency(startTotalPatrimony)}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4 md:p-6 flex flex-col justify-between h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-green-500/10 rounded-full text-green-500">
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-xs md:text-sm font-medium text-muted-foreground">Em 12 meses</span>
            </div>
            <p className="text-lg md:text-2xl font-bold">{formatCurrency(finalBalance)}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4 md:p-6 flex flex-col justify-between h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-2 rounded-full ${totalGrowth >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                {totalGrowth >= 0 ? <ArrowUpCircle className="w-4 h-4 md:w-5 md:h-5" /> : <TrendingDown className="w-4 h-4 md:w-5 md:h-5" />}
              </div>
              <span className="text-xs md:text-sm font-medium text-muted-foreground">Crescimento</span>
            </div>
            <p className={`text-lg md:text-2xl font-bold ${totalGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalGrowth > 0 ? '+' : ''}{formatCurrency(totalGrowth)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4 md:p-6 flex flex-col justify-between h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-purple-500/10 rounded-full text-purple-500">
                <Calculator className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-xs md:text-sm font-medium text-muted-foreground">Retorno</span>
            </div>
            <p className={`text-lg md:text-2xl font-bold ${growthPercentage >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {growthPercentage.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* GRÁFICO - Ajustado para telas pequenas */}
      <Card className="col-span-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg md:text-xl">Evolução Patrimonial</CardTitle>
          <CardDescription>Juros compostos ({state.settings.monthlyYield}% a.m.) + Fluxo de Caixa</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px] md:h-[400px] p-0 md:p-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projectionData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis 
                dataKey="shortMonth" 
                tickLine={false} 
                axisLine={false} 
                tickMargin={10} 
                style={{ fontSize: '10px' }}
                interval="preserveStartEnd"
              />
              {/* Oculta eixo Y em telas muito pequenas para dar espaço */}
              <YAxis 
                hide={typeof window !== 'undefined' && window.innerWidth < 600}
                tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} 
                tickLine={false} 
                axisLine={false} 
                tickMargin={10}
                style={{ fontSize: '10px' }} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                formatter={(value: number, name: string) => [
                  formatCurrency(value), 
                  name === 'balance' ? 'Patrimônio Total' : (name === 'invested' ? 'Investimentos' : 'Caixa')
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Line 
                type="monotone" 
                dataKey="balance" 
                name="Total"
                stroke="hsl(var(--primary))" 
                strokeWidth={3} 
                dot={false} 
                activeDot={{ r: 6 }} 
              />
              <Line 
                type="monotone" 
                dataKey="invested" 
                name="Investido"
                stroke="#10b981" 
                strokeDasharray="5 5"
                strokeWidth={2} 
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* DETALHAMENTO - Responsivo (Tabela Desktop / Cards Mobile) */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold px-1">Detalhamento Mensal</h3>
        
        {/* VERSÃO MOBILE: LISTA DE CARDS */}
        <div className="md:hidden space-y-3">
          {projectionData.map((row, i) => (
            <Card key={i} className={`border ${row.isCurrent ? 'border-primary/50 bg-primary/5' : ''}`}>
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3 border-b pb-2 border-border/50">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold capitalize">{row.shortMonth}</span>
                    {row.isCurrent && <Badge variant="secondary" className="text-[10px] h-5">Atual</Badge>}
                  </div>
                  <span className="font-bold text-lg">{formatCurrency(row.balance)}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <div className="text-muted-foreground">Entradas</div>
                  <div className="text-right text-green-600 font-medium">
                    {row.isCurrent ? '-' : `+ ${formatCurrency(row.fixedIncome)}`}
                  </div>

                  <div className="text-muted-foreground">Saídas</div>
                  <div className="text-right text-red-600 font-medium">
                    {row.isCurrent ? '-' : `- ${formatCurrency(row.totalExpenses)}`}
                  </div>

                  <div className="text-muted-foreground">Rendimento</div>
                  <div className="text-right text-purple-600 font-medium">
                    {row.yield > 0 ? `+ ${formatCurrency(row.yield)}` : '-'}
                  </div>

                  <div className="col-span-2 h-px bg-border/50 my-1" />

                  <div className="text-muted-foreground font-medium">Investido</div>
                  <div className="text-right text-emerald-600 font-medium">
                    {formatCurrency(row.invested)}
                  </div>

                  <div className="text-muted-foreground font-medium">Caixa</div>
                  <div className="text-right text-slate-500 font-medium">
                    {formatCurrency(row.cash)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* VERSÃO DESKTOP: TABELA (Escondida no mobile) */}
        <div className="hidden md:block border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-medium">Mês</th>
                <th className="text-right py-3 px-4 font-medium text-green-600">Entradas</th>
                <th className="text-right py-3 px-4 font-medium text-red-600">Saídas</th>
                <th className="text-right py-3 px-4 font-medium text-purple-600">Rendimento</th>
                <th className="text-right py-3 px-4 font-medium text-emerald-600">Investido</th>
                <th className="text-right py-3 px-4 font-medium text-slate-500">Caixa</th>
                <th className="text-right py-3 px-4 font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {projectionData.map((row, i) => (
                <tr key={i} className={`border-b last:border-0 hover:bg-muted/50 transition-colors ${row.isCurrent ? 'bg-muted/30' : ''}`}>
                  <td className="py-3 px-4 font-medium flex items-center gap-2 capitalize">
                    {row.shortMonth}
                    {row.isCurrent && <Badge variant="outline" className="text-[10px] h-5">Atual</Badge>}
                  </td>
                  <td className="text-right py-3 px-4 text-muted-foreground">
                    {row.isCurrent ? '-' : `+ ${formatCurrency(row.fixedIncome)}`}
                  </td>
                  <td className="text-right py-3 px-4 text-muted-foreground">
                    {row.isCurrent ? '-' : `- ${formatCurrency(row.totalExpenses)}`}
                  </td>
                  <td className="text-right py-3 px-4 font-medium text-purple-600">
                    {row.yield > 0 ? `+ ${formatCurrency(row.yield)}` : '-'}
                  </td>
                  <td className="text-right py-3 px-4 font-medium text-emerald-600">
                    {formatCurrency(row.invested)}
                  </td>
                  <td className="text-right py-3 px-4 text-muted-foreground">
                    {formatCurrency(row.cash)}
                  </td>
                  <td className="text-right py-3 px-4 font-bold">
                    {formatCurrency(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}