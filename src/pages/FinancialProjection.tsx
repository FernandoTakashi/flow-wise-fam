import { useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Calendar } from 'lucide-react';

export default function FinancialProjection() {
  const { state, getTotalInvestments, getDashboardData } = useFinance();
  
  const projectionMonths = 12; 
  const today = new Date();
  const startMonth = today.getMonth();
  const startYear = today.getFullYear();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // 1. CÁLCULO EXATO DO MÊS ATUAL (HOJE)
  const currentMonthTotals = useMemo(() => {
      const fixedIncomeTotal = state.fixedIncomes.reduce((sum, i) => sum + Number(i.amount), 0);
      const extraIncome = state.cashMovements
          .filter(m => { 
              const d = new Date(m.date); 
              return m.type === 'income' && d.getMonth() === startMonth && d.getFullYear() === startYear; 
          })
          .reduce((sum, m) => sum + Number(m.amount), 0);

      const fixedExpenseTotal = state.fixedExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      
      const currentMonthExpenses = state.expenses
          .filter(e => {
              const d = new Date(e.date);
              return d.getMonth() === startMonth && d.getFullYear() === startYear;
          })
          .reduce((sum, e) => sum + Number(e.amount), 0);

      const extraOutflows = state.cashMovements
          .filter(m => { 
              const d = new Date(m.date); 
              return m.type === 'outcome' && d.getMonth() === startMonth && d.getFullYear() === startYear; 
          })
          .reduce((sum, m) => sum + Number(m.amount), 0);

      const dashboard = getDashboardData();

      return {
          totalIncome: fixedIncomeTotal + extraIncome,
          totalExpenses: fixedExpenseTotal + currentMonthExpenses + extraOutflows,
          currentBalance: dashboard.projectedBalance 
      };
  }, [state, startMonth, startYear, getDashboardData]);

  const startInvestedBalance = getTotalInvestments();
  const startCashBalance = currentMonthTotals.currentBalance;

  // 2. MÉDIAS PARA O FUTURO
  const totalFixedIncome = useMemo(() => state.fixedIncomes.reduce((sum, i) => sum + Number(i.amount), 0), [state.fixedIncomes]);
  const totalFixedExpenses = useMemo(() => state.fixedExpenses.reduce((sum, e) => sum + Number(e.amount), 0), [state.fixedExpenses]);

  // A média de consumo variável deve ignorar cartão de crédito para não duplicar com a lógica de parcelas abaixo
  const averageVariableConsumption = useMemo(() => {
    let checkMonth = startMonth - 1; 
    let checkYear = startYear;
    let totalVariable = 0;
    let count = 0;

    for (let i = 0; i < 3; i++) {
      if (checkMonth < 0) { checkMonth += 12; checkYear -= 1; }
      const monthlySum = state.expenses
        .filter(e => {
          const d = new Date(e.date);
          // IMPORTANTE: Só soma o que NÃO é cartão (pix, débito, dinheiro)
          return d.getMonth() === checkMonth && 
                 d.getFullYear() === checkYear && 
                 ['debito', 'pix', 'dinheiro', 'variavel'].includes(e.type); 
        })
        .reduce((sum, e) => sum + Number(e.amount), 0);
      
      if (monthlySum > 0) { totalVariable += monthlySum; count++; }
      checkMonth--;
    }
    return count > 0 ? totalVariable / count : 0;
  }, [state.expenses, startMonth, startYear]);

  // 3. PROJEÇÃO
  const projectionData = useMemo(() => {
    const data = [];
    
    let totalInvestedVal = 0;
    let totalYieldVal = 0;
    if (state.investments.length > 0) {
       totalInvestedVal = state.investments.reduce((acc, inv) => acc + Number(inv.amount), 0);
       totalYieldVal = state.investments.reduce((acc, inv) => acc + (Number(inv.amount) * (Number(inv.yieldRate || 0)/100)), 0);
    }
    const monthlyYieldRate = totalInvestedVal > 0 ? (totalYieldVal / totalInvestedVal) : 0;

    let accumulatedInvested = startInvestedBalance; 
    let accumulatedCash = startCashBalance;

    for (let i = 0; i <= projectionMonths; i++) {
      const currentProjectionDate = new Date(startYear, startMonth + i, 1);
      const loopMonth = currentProjectionDate.getMonth();
      const loopYear = currentProjectionDate.getFullYear();
      
      let yieldAmount = 0;
      let monthIncome = 0;
      let monthExpenses = 0;

      // MÊS ATUAL (i=0)
      if (i === 0) {
        if (accumulatedInvested > 0) yieldAmount = accumulatedInvested * monthlyYieldRate;
        monthIncome = currentMonthTotals.totalIncome;
        monthExpenses = currentMonthTotals.totalExpenses;
      } 
      // MESES FUTUROS
      else {
        if (accumulatedInvested > 0) yieldAmount = accumulatedInvested * monthlyYieldRate;
        accumulatedInvested += yieldAmount;

        monthIncome = totalFixedIncome; 

        // SOMA DAS FATURAS DE CARTÃO FUTURAS
        // Aqui somamos todas as parcelas de cartão que caem neste mês específico
        const futureCardInstallments = state.expenses
          .filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === loopMonth && d.getFullYear() === loopYear && e.type === 'cartao_credito';
          })
          .reduce((sum, e) => sum + Number(e.amount), 0);

        // A Pagar = Fixos + Fatura Cartão + Média Variável (Pix/Débito)
        monthExpenses = totalFixedExpenses + futureCardInstallments + averageVariableConsumption;
        
        accumulatedCash = accumulatedCash + monthIncome - monthExpenses;
      }

      data.push({
        month: currentProjectionDate.toLocaleDateString('pt-BR', { month: 'long', year: '2-digit' }), 
        shortMonth: currentProjectionDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), 
        desktopMonth: currentProjectionDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
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
  }, [state.expenses, state.investments, state.fixedIncomes, state.fixedExpenses, startInvestedBalance, startCashBalance, startMonth, startYear, totalFixedIncome, totalFixedExpenses, averageVariableConsumption, currentMonthTotals]);

  const startTotalPatrimony = (projectionData[0]?.balance || 0);
  const finalBalance = (projectionData[projectionData.length - 1]?.balance || 0);
  const totalGrowth = finalBalance - startTotalPatrimony;
  const growthPercentage = startTotalPatrimony !== 0 ? (totalGrowth / Math.abs(startTotalPatrimony)) * 100 : (finalBalance > 0 ? 100 : 0);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-24 md:pb-10">
      
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-primary" />
          Projeção Financeira
        </h1>
        <p className="text-sm text-muted-foreground">
          Cenário base para os próximos 12 meses
        </p>
      </div>

      {/* CARDS DE KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-card border shadow-sm">
          <CardContent className="p-4 md:p-6">
            <p className="text-xs font-medium text-muted-foreground mb-1">Patrimônio Hoje</p>
            <p className="text-lg md:text-2xl font-bold text-foreground">{formatCurrency(startTotalPatrimony)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border shadow-sm">
          <CardContent className="p-4 md:p-6">
            <p className="text-xs font-medium text-muted-foreground mb-1">Em 12 meses</p>
            <p className="text-lg md:text-2xl font-bold text-primary">{formatCurrency(finalBalance)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border shadow-sm">
          <CardContent className="p-4 md:p-6">
            <p className="text-xs font-medium text-muted-foreground mb-1">Crescimento</p>
            <p className={`text-lg md:text-2xl font-bold ${totalGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalGrowth > 0 ? '+' : ''}{formatCurrency(totalGrowth)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border shadow-sm">
          <CardContent className="p-4 md:p-6">
            <p className="text-xs font-medium text-muted-foreground mb-1">Retorno %</p>
            <p className={`text-lg md:text-2xl font-bold ${growthPercentage >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {growthPercentage.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* GRÁFICO */}
      <Card className="shadow-card">
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-base">Curva de Evolução</CardTitle>
        </CardHeader>
        <CardContent className="h-[250px] md:h-[350px] p-2 md:p-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="shortMonth" tickLine={false} axisLine={false} tick={{fontSize: 10}} interval="preserveStartEnd" />
              <YAxis hide={true} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }} formatter={(value: number) => formatCurrency(value)} />
              <Legend iconType="circle" wrapperStyle={{fontSize: '12px', marginTop: '10px'}} />
              <Line type="monotone" dataKey="balance" name="Total" stroke="#3b82f6" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="invested" name="Investido" stroke="#10b981" strokeDasharray="4 4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* TABELA DE DETALHAMENTO */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold px-1">Detalhamento Mensal</h3>
        
        {/* VERSÃO MOBILE: LISTA DE CARDS */}
        <div className="md:hidden space-y-3">
          {projectionData.map((row, i) => (
            <Card key={i} className={`shadow-sm border-l-4 ${row.isCurrent ? 'border-l-primary bg-primary/5' : 'border-l-transparent'}`}>
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3 border-b border-border/50 pb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold capitalize text-sm">{row.shortMonth}</span>
                    {row.isCurrent && <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Atual</Badge>}
                  </div>
                  <span className="font-bold text-base">{formatCurrency(row.balance)}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-1 text-xs">
                  <div className="text-muted-foreground">Entradas</div>
                  <div className="text-right text-green-600 font-medium">+ {formatCurrency(row.fixedIncome)}</div>
                  <div className="text-muted-foreground">Saídas</div>
                  <div className="text-right text-red-600 font-medium">- {formatCurrency(row.totalExpenses)}</div>
                  <div className="text-muted-foreground">Rendimento</div>
                  <div className="text-right text-purple-600 font-medium">{row.yield > 0 ? `+ ${formatCurrency(row.yield)}` : '-'}</div>
                  <div className="col-span-2 h-px bg-border/50 my-1" />
                  <div className="text-muted-foreground font-medium">Investido</div>
                  <div className="text-right text-emerald-600 font-medium">{formatCurrency(row.invested)}</div>
                  <div className="text-muted-foreground font-medium">Caixa</div>
                  <div className="text-right text-slate-500 font-medium">{formatCurrency(row.cash)}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* VERSÃO DESKTOP: TABELA (Estilo preservado) */}
        <div className="hidden md:block border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b border-border">
                <th className="text-left py-4 px-4 font-semibold text-muted-foreground w-[15%]">Mês</th>
                <th className="text-right py-4 px-4 font-semibold text-green-600 w-[12%]">Entradas</th>
                <th className="text-right py-4 px-4 font-semibold text-red-600 w-[12%]">Saídas</th>
                <th className="text-right py-4 px-4 font-semibold text-purple-600 w-[12%]">Rendimento</th>
                <th className="text-right py-4 px-4 font-semibold text-emerald-600 w-[12%]">Investido</th>
                <th className="text-right py-4 px-4 font-semibold text-slate-500 w-[12%]">Caixa</th>
                <th className="text-right py-4 px-4 font-bold text-foreground w-[15%]">Total</th>
              </tr>
            </thead>
            <tbody>
              {projectionData.map((row, i) => (
                <tr key={i} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${row.isCurrent ? 'bg-muted/20' : ''}`}>
                  <td className="py-4 px-4 font-medium flex items-center gap-2 capitalize">
                    {row.shortMonth.replace('.', '')}
                    {row.isCurrent && <Badge variant="outline" className="text-[10px] h-5 ml-1 bg-background">Atual</Badge>}
                  </td>
                  <td className="text-right py-4 px-4 text-muted-foreground">
                    + {formatCurrency(row.fixedIncome)}
                  </td>
                  <td className="text-right py-4 px-4 text-muted-foreground">
                    - {formatCurrency(row.totalExpenses)}
                  </td>
                  <td className="text-right py-4 px-4 font-medium text-purple-600">
                    {row.yield > 0 ? `+ ${formatCurrency(row.yield)}` : '-'}
                  </td>
                  <td className="text-right py-4 px-4 font-medium text-emerald-600">
                    {formatCurrency(row.invested)}
                  </td>
                  <td className="text-right py-4 px-4 text-muted-foreground">
                    {formatCurrency(row.cash)}
                  </td>
                  <td className="text-right py-4 px-4 font-bold text-foreground">
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