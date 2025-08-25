import { useFinance } from '@/contexts/FinanceContext';
import { DashboardCard } from '@/components/DashboardCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  TrendingUp,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Users,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Dashboard() {
  const { state, getDashboardData } = useFinance();
  const dashboardData = getDashboardData();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getBalanceVariant = (balance: number) => {
    if (balance > 1000) return 'success';
    if (balance > 0) return 'warning';
    return 'danger';
  };

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
        <Button className="bg-gradient-primary hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" />
          Novo Gasto
        </Button>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title="Gastos do Mês"
          value={formatCurrency(dashboardData.monthlyExpenses)}
          description="Total gasto este mês"
          icon={<ArrowDownCircle className="w-6 h-6" />}
          variant="danger"
        />
        
        <DashboardCard
          title="Saldo Atual"
          value={formatCurrency(dashboardData.currentBalance)}
          description="Disponível em caixa"
          icon={<Wallet className="w-6 h-6" />}
          variant={getBalanceVariant(dashboardData.currentBalance)}
        />
        
        <DashboardCard
          title="Projeção Próximo Mês"
          value={formatCurrency(dashboardData.projectedBalance)}
          description={`Com rendimento de ${state.settings.monthlyYield}%`}
          icon={<TrendingUp className="w-6 h-6" />}
          variant="success"
          trend="up"
          trendValue={`+${state.settings.monthlyYield}%`}
        />
        
        <DashboardCard
          title="Pendências"
          value={dashboardData.pendingFixedExpenses + dashboardData.pendingCreditCards}
          description="Fixos + cartões pendentes"
          icon={<AlertCircle className="w-6 h-6" />}
          variant={dashboardData.pendingFixedExpenses + dashboardData.pendingCreditCards > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gastos Fixos */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span>Gastos Fixos</span>
            </CardTitle>
            <CardDescription>Status dos gastos fixos do mês</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {state.fixedExpenses.slice(0, 5).map((expense) => (
              <div key={expense.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${expense.isPaid ? 'bg-success' : 'bg-warning'}`} />
                  <div>
                    <p className="font-medium text-sm">{expense.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Vence dia {expense.dueDay}
                    </p>
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
            
            {state.fixedExpenses.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum gasto fixo cadastrado</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cartões de Crédito */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <span>Cartões de Crédito</span>
            </CardTitle>
            <CardDescription>Status das faturas dos cartões</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {state.creditCards.map((card) => (
              <div key={card.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${card.isPaid ? 'bg-success' : 'bg-warning'}`} />
                  <div>
                    <p className="font-medium text-sm">{card.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Vence dia {card.dueDay}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(card.limit * 0.3)}</p>
                  <Badge variant={card.isPaid ? 'default' : 'secondary'} className="text-xs">
                    {card.isPaid ? 'Quitada' : 'Pendente'}
                  </Badge>
                </div>
              </div>
            ))}
            
            {state.creditCards.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum cartão cadastrado</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ranking de Usuários */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-primary" />
            <span>Participação por Usuário</span>
          </CardTitle>
          <CardDescription>Ranking de movimentações financeiras</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dashboardData.topUsers.map((user, index) => (
              <div key={user.userId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-primary text-white flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{user.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.type === 'income' ? 'Maior contribuidor' : 'Maior gastador'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {user.type === 'income' ? (
                    <ArrowUpCircle className="w-4 h-4 text-success" />
                  ) : (
                    <ArrowDownCircle className="w-4 h-4 text-destructive" />
                  )}
                  <span className={`font-medium ${user.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(Math.abs(user.totalAmount))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}