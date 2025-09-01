import { useState, useEffect } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import MonthSelector from '@/components/MonthSelector';
import { Check, Clock, DollarSign, Calendar, TrendingUp, TrendingDown, CreditCard, PiggyBank } from 'lucide-react';
import { MonthlyData } from '@/types';

const categories: Record<string, string> = {
  'alimentacao': 'Alimentação',
  'transporte': 'Transporte', 
  'lazer': 'Lazer',
  'saude': 'Saúde',
  'educacao': 'Educação',
  'moradia': 'Moradia',
  'vestuario': 'Vestuário',
  'outros': 'Outros'
};

export default function MonthlyView() {
  const { state, dispatch, getMonthlyData, getActiveFixedExpenses } = useFinance();
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
    dispatch({ type: 'SET_SELECTED_MONTH', payload: { month, year } });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getUserName = (userId: string) => {
    return state.users.find(user => user.id === userId)?.name || 'Usuário';
  };

  const getCategoryLabel = (category: string) => {
    return categories[category] || category;
  };

  const handleFixedExpensePayment = (expenseId: string, userId: string) => {
    dispatch({
      type: 'UPDATE_FIXED_EXPENSE',
      payload: {
        id: expenseId,
        updates: {
          isPaid: true,
          paidBy: userId,
          paidAt: new Date()
        }
      }
    });
  };

  if (!monthlyData) return null;

  const totalFixedExpenses = monthlyData.fixedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalVariableExpenses = monthlyData.variableExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalCreditCardExpenses = monthlyData.creditCardExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalIncome = monthlyData.cashMovements
    .filter(movement => movement.type === 'income')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalOutcome = monthlyData.cashMovements
    .filter(movement => movement.type === 'outcome')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalInvestments = monthlyData.investments.reduce((sum, investment) => sum + investment.amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Controle Mensal</h1>
          <p className="text-muted-foreground">
            Visualize todas as movimentações de um mês específico
          </p>
        </div>
      </div>

      {/* Seletor de Mês */}
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
                <p className="text-sm font-medium text-muted-foreground">Entradas</p>
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(totalIncome)}
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
              <p className="text-center text-muted-foreground py-4">
                Nenhum gasto fixo para este mês
              </p>
            ) : (
              <div className="space-y-3">
                {monthlyData.fixedExpenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-foreground">{expense.name}</h4>
                        <Badge variant="outline">{getCategoryLabel(expense.category)}</Badge>
                        <Badge variant={expense.isPaid ? "default" : "secondary"}>
                          {expense.isPaid ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Pago
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 mr-1" />
                              Pendente
                            </>
                          )}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Vence dia {expense.dueDay}
                        {expense.isPaid && expense.paidBy && (
                          <> - Pago por {getUserName(expense.paidBy)}</>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{formatCurrency(expense.amount)}</p>
                      {!expense.isPaid && (
                        <div className="flex space-x-1 mt-1">
                          {state.users.map((user) => (
                            <Button
                              key={user.id}
                              variant="outline"
                              size="sm"
                              onClick={() => handleFixedExpensePayment(expense.id, user.id)}
                              className="text-xs"
                            >
                              {user.name}
                            </Button>
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
              <p className="text-center text-muted-foreground py-4">
                Nenhum gasto variável para este mês
              </p>
            ) : (
              <div className="space-y-3">
                {monthlyData.variableExpenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-foreground">{expense.description}</h4>
                        <Badge variant="outline">{getCategoryLabel(expense.category)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(expense.date).toLocaleDateString('pt-BR')} - {getUserName(expense.userId)}
                      </p>
                    </div>
                    <p className="font-semibold text-foreground">{formatCurrency(expense.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Movimentações de Caixa */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5" />
              <span>Movimentações de Caixa ({monthlyData.cashMovements.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.cashMovements.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhuma movimentação para este mês
              </p>
            ) : (
              <div className="space-y-3">
                {monthlyData.cashMovements.map((movement) => (
                  <div key={movement.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-foreground">{movement.description}</h4>
                        <Badge variant={movement.type === 'income' ? 'default' : 'secondary'}>
                          {movement.type === 'income' ? 'Entrada' : 'Saída'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(movement.date).toLocaleDateString('pt-BR')} - {getUserName(movement.userId)}
                      </p>
                    </div>
                    <p className={`font-semibold ${movement.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                      {movement.type === 'income' ? '+' : '-'}{formatCurrency(movement.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Investimentos */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <PiggyBank className="w-5 h-5" />
              <span>Investimentos ({monthlyData.investments.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.investments.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhum investimento para este mês
              </p>
            ) : (
              <div className="space-y-3">
                {monthlyData.investments.map((investment) => (
                  <div key={investment.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-foreground">{investment.description}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(investment.date).toLocaleDateString('pt-BR')} - {getUserName(investment.userId)}
                      </p>
                    </div>
                    <p className="font-semibold text-primary">+{formatCurrency(investment.amount)}</p>
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