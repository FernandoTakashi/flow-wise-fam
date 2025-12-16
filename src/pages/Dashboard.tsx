import { useFinance } from '@/contexts/FinanceContext';
import { DashboardCard } from '@/components/DashboardCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, TrendingUp, AlertCircle, CheckCircle2, Users, Plus, ArrowUpCircle, ArrowDownCircle, Check, Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Dashboard() {
  const { state, getDashboardData } = useFinance();
  const navigate = useNavigate();
  const dashboardData = getDashboardData();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getBalanceVariant = (balance: number) => {
    if (balance > 1000) return 'success';
    if (balance >= 0) return 'warning';
    return 'danger';
  };

  // Filtrar apenas entradas fixas ativas (opcional: ou mostrar todas do state)
  const recentFixedIncomes = state.fixedIncomes.slice(0, 3);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard Financeiro</h1>
          <p className="text-muted-foreground">
            Visão geral das finanças em {format(new Date(), 'MMMM yyyy', { locale: ptBR })}
          </p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => navigate('/fixed-incomes')} variant="outline" className="border-green-200 text-green-700 hover:bg-green-50">
            <ArrowUpCircle className="w-4 h-4 mr-2" /> Nova Entrada
          </Button>
          <Button onClick={() => navigate('/variable-expenses')} className="bg-gradient-primary hover:opacity-90">
            <Plus className="w-4 h-4 mr-2" /> Novo Gasto
          </Button>
        </div>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title="Gastos do Mês"
          value={formatCurrency(dashboardData.monthlyExpenses)}
          description="Total variável gasto"
          icon={<ArrowDownCircle className="w-6 h-6" />}
          variant="danger"
        />
        
        <DashboardCard
          title="Saldo Atual"
          value={formatCurrency(dashboardData.currentBalance)}
          description="Caixa + Recebidos - Gastos"
          icon={<Wallet className="w-6 h-6" />}
          variant={getBalanceVariant(dashboardData.currentBalance)}
        />
        
        <DashboardCard
          title="Projeção"
          value={formatCurrency(dashboardData.projectedBalance)}
          description={`Rendimento: ${state.settings.monthlyYield}%`}
          icon={<TrendingUp className="w-6 h-6" />}
          variant="success"
        />
        
        <DashboardCard
          title="Pendências"
          value={dashboardData.pendingFixedExpenses + dashboardData.pendingCreditCards}
          description="Contas a pagar"
          icon={<AlertCircle className="w-6 h-6" />}
          variant={dashboardData.pendingFixedExpenses > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <div className="space-y-6">
            {/* Entradas Fixas (Resumo) */}
            <Card className="shadow-card border-l-4 border-l-green-500">
              <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2 text-base">
                        <ArrowUpCircle className="w-5 h-5 text-green-600" />
                        <span>Entradas Fixas</span>
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/fixed-incomes')} className="text-xs h-8">Ver Todas</Button>
                  </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                  {recentFixedIncomes.map((income) => (
                    <div key={income.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${income.isReceived ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <div>
                              <p className="font-medium text-sm">{income.description}</p>
                              <p className="text-xs text-muted-foreground">Dia {income.receiveDay}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-green-700">+{formatCurrency(income.amount)}</p>
                          <Badge variant={income.isReceived ? 'default' : 'secondary'} className="text-[10px] h-5 px-1.5">
                              {income.isReceived ? 'Recebido' : 'Pendente'}
                          </Badge>
                        </div>
                    </div>
                  ))}
                  {recentFixedIncomes.length === 0 && <p className="text-center text-sm text-muted-foreground py-2">Nenhuma entrada fixa cadastrada.</p>}
              </CardContent>
            </Card>

            {/* Gastos Fixos Recentes */}
            <Card className="shadow-card">
              <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2 text-base">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                        <span>Gastos Fixos Próximos</span>
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={() => navigate('/fixed-expenses')}>Ver Todos</Button>
                  </div>
              </CardHeader>
              <CardContent className="space-y-4">
                  {state.fixedExpenses.slice(0, 5).map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${expense.isPaid ? 'bg-success' : 'bg-warning'}`} />
                          <div>
                              <p className="font-medium text-sm">{expense.name}</p>
                              <p className="text-xs text-muted-foreground">Vence dia {expense.dueDay}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(expense.amount)}</p>
                          <Badge variant={expense.isPaid ? 'default' : 'secondary'} className="text-xs">
                              {expense.isPaid ? 'Pago' : 'Pendente'}
                          </Badge>
                        </div>
                    </div>
                  ))}
                  {state.fixedExpenses.length === 0 && <p className="text-center text-muted-foreground py-4">Sem gastos fixos.</p>}
              </CardContent>
            </Card>
        </div>

        {/* Ranking e Resumo */}
        <div className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="w-5 h-5 text-primary" />
                    <span>Quem gastou mais?</span>
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="space-y-4">
                    {dashboardData.topUsers.map((user, index) => (
                        <div key={user.userId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                          <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">
                                {index + 1}
                              </div>
                              <p className="font-medium">{user.userName}</p>
                          </div>
                          <p className="font-bold text-destructive">{formatCurrency(user.totalAmount)}</p>
                        </div>
                    ))}
                    {dashboardData.topUsers.length === 0 && <p className="text-center text-muted-foreground py-4">Sem dados de gastos ainda.</p>}
                  </div>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}