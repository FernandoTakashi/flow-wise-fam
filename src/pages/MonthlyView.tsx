import { useState, useEffect } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import MonthSelector from '@/components/MonthSelector';
import { Check, Clock, DollarSign, Calendar, TrendingUp, TrendingDown, PiggyBank, ArrowUpCircle } from 'lucide-react';
import { MonthlyData } from '@/types';
import { useToast } from '@/hooks/use-toast';

const categories: Record<string, string> = {
  'alimentacao': 'Alimentação', 'transporte': 'Transporte', 'lazer': 'Lazer',
  'saude': 'Saúde', 'educacao': 'Educação', 'moradia': 'Moradia',
  'vestuario': 'Vestuário', 'outros': 'Outros'
};

export default function MonthlyView() {
  // Importamos getActiveFixedIncomes
  const { state, getMonthlyData, updateFixedExpense, getActiveFixedIncomes, updateFixedIncome } = useFinance(); 
  const { toast } = useToast();
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);

  useEffect(() => {
    const data = getMonthlyData(selectedMonth, selectedYear);
    setMonthlyData(data);
  }, [selectedMonth, selectedYear, state, getMonthlyData]);

  const handleMonthYearChange = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };
  const getUserName = (userId: string) => state.users.find(user => user.id === userId)?.name || 'Usuário';
  const getCategoryLabel = (category: string) => categories[category] || category;

  const handleFixedExpensePayment = async (expenseId: string, userId: string) => {
    await updateFixedExpense(expenseId, { isPaid: true, paidBy: userId, paidAt: new Date() });
    toast({ title: "Conta paga!", description: "Pagamento registrado com sucesso." });
  };
  
  // Função para receber entrada fixa direto daqui (opcional)
  const handleFixedIncomeReceive = async (incomeId: string, userId: string) => {
    await updateFixedIncome(incomeId, { isReceived: true, receivedBy: userId, receivedAt: new Date() });
    toast({ title: "Valor recebido!", description: "Entrada registrada com sucesso." });
  };

  if (!monthlyData) return null;

  // --- CÁLCULOS ATUALIZADOS ---
  const activeFixedIncomes = getActiveFixedIncomes(selectedMonth, selectedYear);

  const totalFixedExpenses = monthlyData.fixedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalVariableExpenses = monthlyData.variableExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  
  const totalCashIncome = monthlyData.cashMovements
    .filter(movement => movement.type === 'income')
    .reduce((sum, movement) => sum + movement.amount, 0);
    
  const totalFixedIncome = activeFixedIncomes.reduce((sum, income) => sum + income.amount, 0);
  
  // Total Geral de Entradas (Fixo + Caixa)
  const totalIncome = totalCashIncome + totalFixedIncome;

  const totalInvestments = monthlyData.investments.reduce((sum, investment) => sum + investment.amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Controle Mensal</h1>
          <p className="text-muted-foreground">Visualize todas as movimentações de um mês específico</p>
        </div>
      </div>

      <MonthSelector 
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        onMonthYearChange={handleMonthYearChange}
      />

      {/* Resumo do Mês */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Entradas Totais</p>
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(totalIncome)}
                </p>
                <p className="text-xs text-muted-foreground">
                   (Fixas: {formatCurrency(totalFixedIncome)})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Gastos Fixos</p>
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(totalFixedExpenses)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-warning" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Gastos Variáveis</p>
                <p className="text-2xl font-bold text-warning">
                  {formatCurrency(totalVariableExpenses)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <PiggyBank className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Investimentos</p>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(totalInvestments)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Entradas Fixas (Lista Nova para visualização rápida) */}
        <Card className="shadow-card lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                    <ArrowUpCircle className="w-5 h-5 text-success" />
                    <span>Entradas Fixas do Mês ({activeFixedIncomes.length})</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {activeFixedIncomes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">Nenhuma entrada fixa para este mês</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeFixedIncomes.map((income) => (
                            <div key={income.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/20">
                                <div>
                                    <p className="font-medium">{income.description}</p>
                                    <p className="text-sm text-muted-foreground">Dia {income.receiveDay}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-success">{formatCurrency(income.amount)}</p>
                                    <Badge variant={income.isReceived ? "default" : "secondary"}>
                                        {income.isReceived ? "Recebido" : "Pendente"}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>

        {/* Gastos Fixos */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="w-5 h-5" />
              <span>Gastos Fixos ({monthlyData.fixedExpenses.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.fixedExpenses.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhum gasto fixo ativo neste mês</p>
            ) : (
              <div className="space-y-3">
                {monthlyData.fixedExpenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-foreground">{expense.name}</h4>
                        <Badge variant="outline">{getCategoryLabel(expense.category)}</Badge>
                        <Badge variant={expense.isPaid ? "default" : "secondary"}>
                          {expense.isPaid ? <><Check className="w-3 h-3 mr-1" /> Pago</> : <><Clock className="w-3 h-3 mr-1" /> Pendente</>}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Vence dia {expense.dueDay}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{formatCurrency(expense.amount)}</p>
                      {!expense.isPaid && (
                        <div className="flex space-x-1 mt-1">
                          {state.users.map((user) => (
                            <Button key={user.id} variant="outline" size="sm" onClick={() => handleFixedExpensePayment(expense.id, user.id)} className="text-xs h-7 px-2">{user.name}</Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gastos Variáveis */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5" />
              <span>Gastos Variáveis ({monthlyData.variableExpenses.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.variableExpenses.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhum gasto variável para este mês</p>
            ) : (
              <div className="space-y-3">
                {monthlyData.variableExpenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-foreground">{expense.description}</h4>
                        <Badge variant="outline">{getCategoryLabel(expense.category)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{new Date(expense.date).toLocaleDateString('pt-BR')} - {getUserName(expense.userId)}</p>
                    </div>
                    <p className="font-semibold text-foreground">{formatCurrency(expense.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}