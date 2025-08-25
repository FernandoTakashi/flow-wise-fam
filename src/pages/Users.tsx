import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Users as UsersIcon, 
  Plus, 
  User, 
  ArrowUpCircle, 
  ArrowDownCircle,
  Calendar,
  Activity,
  CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Users() {
  const { state, dispatch } = useFinance();
  const { toast } = useToast();
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast({
        title: 'Erro',
        description: 'O nome é obrigatório',
        variant: 'destructive'
      });
      return;
    }

    const newUser = {
      id: Date.now().toString(),
      name: formData.name,
      email: formData.email || undefined,
      createdAt: new Date()
    };

    dispatch({ type: 'ADD_USER', payload: newUser });

    toast({
      title: 'Sucesso!',
      description: 'Usuário cadastrado com sucesso',
    });

    setFormData({
      name: '',
      email: ''
    });
    setShowForm(false);
  };

  // Estatísticas por usuário
  const getUserStats = (userId: string) => {
    // Gastos
    const userExpenses = state.expenses.filter(expense => expense.userId === userId);
    const totalExpenses = userExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    // Movimentações de caixa
    const userMovements = state.cashMovements.filter(movement => movement.userId === userId);
    const totalIncome = userMovements
      .filter(movement => movement.type === 'income')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const totalOutcome = userMovements
      .filter(movement => movement.type === 'outcome')
      .reduce((sum, movement) => sum + movement.amount, 0);
    
    // Gastos fixos pagos
    const paidFixedExpenses = state.fixedExpenses.filter(expense => expense.paidBy === userId);
    
    // Cartões pagos
    const paidCreditCards = state.creditCards.filter(card => card.paidBy === userId);
    
    // Atividade recente
    const recentActivity = [
      ...userExpenses.map(expense => ({
        type: 'expense',
        description: expense.description,
        amount: expense.amount,
        date: expense.date
      })),
      ...userMovements.map(movement => ({
        type: movement.type,
        description: movement.description,
        amount: movement.amount,
        date: movement.date
      })),
      ...paidFixedExpenses.filter(expense => expense.paidAt).map(expense => ({
        type: 'fixed_payment',
        description: `Pagamento: ${expense.name}`,
        amount: expense.amount,
        date: expense.paidAt!
      })),
      ...paidCreditCards.filter(card => card.paidAt).map(card => ({
        type: 'card_payment',
        description: `Quitação cartão: ${card.name}`,
        amount: 0, // Não temos o valor da fatura aqui
        date: card.paidAt!
      }))
    ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

    return {
      totalExpenses,
      totalIncome,
      totalOutcome,
      netMovement: totalIncome - totalOutcome,
      paidFixedExpenses: paidFixedExpenses.length,
      paidCreditCards: paidCreditCards.length,
      recentActivity
    };
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'income':
        return <ArrowUpCircle className="w-4 h-4 text-success" />;
      case 'outcome':
        return <ArrowDownCircle className="w-4 h-4 text-destructive" />;
      case 'expense':
        return <ArrowDownCircle className="w-4 h-4 text-warning" />;
      case 'fixed_payment':
      case 'card_payment':
        return <CheckCircle2 className="w-4 h-4 text-primary" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case 'income':
        return 'Entrada';
      case 'outcome':
        return 'Saída';
      case 'expense':
        return 'Gasto';
      case 'fixed_payment':
        return 'Fixo Pago';
      case 'card_payment':
        return 'Cartão Quitado';
      default:
        return 'Atividade';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestão de Usuários</h1>
          <p className="text-muted-foreground">
            Controle e acompanhamento dos usuários do sistema
          </p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-primary hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? 'Cancelar' : 'Novo Usuário'}
        </Button>
      </div>

      {/* Resumo geral */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <UsersIcon className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Usuários</p>
                <p className="text-2xl font-bold">{state.users.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Usuários Ativos</p>
                <p className="text-2xl font-bold">{state.users.length}</p>
                <p className="text-xs text-success">Todos ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <ArrowUpCircle className="w-5 h-5 text-success" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Colaboração</p>
                <p className="text-2xl font-bold">100%</p>
                <p className="text-xs text-success">Sistema colaborativo</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Formulário de novo usuário */}
        {showForm && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-primary" />
                <span>Novo Usuário</span>
              </CardTitle>
              <CardDescription>Cadastrar um novo usuário no sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    placeholder="Nome completo"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail (opcional)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90">
                  <Plus className="w-4 h-4 mr-2" />
                  Cadastrar Usuário
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Lista de usuários */}
        <div className={`space-y-4 ${showForm ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
          {state.users.map((user) => {
            const stats = getUserStats(user.id);
            
            return (
              <Card key={user.id} className="shadow-card hover:shadow-card-hover transition-all duration-300">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{user.name}</CardTitle>
                        <CardDescription className="flex items-center space-x-2">
                          <Calendar className="w-3 h-3" />
                          <span>Desde {format(user.createdAt, 'dd/MM/yyyy', { locale: ptBR })}</span>
                          {user.email && (
                            <>
                              <span>•</span>
                              <span>{user.email}</span>
                            </>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="default">Ativo</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Estatísticas financeiras */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/30">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Gastos Totais</p>
                      <p className="text-sm font-bold text-destructive">{formatCurrency(stats.totalExpenses)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Entradas</p>
                      <p className="text-sm font-bold text-success">{formatCurrency(stats.totalIncome)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Saídas</p>
                      <p className="text-sm font-bold text-warning">{formatCurrency(stats.totalOutcome)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Saldo Líquido</p>
                      <p className={`text-sm font-bold ${stats.netMovement >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(stats.netMovement)}
                      </p>
                    </div>
                  </div>

                  {/* Participação em pagamentos */}
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <div>
                        <p className="text-xs text-muted-foreground">Gastos Fixos Pagos</p>
                        <p className="text-sm font-bold">{stats.paidFixedExpenses}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Cartões Quitados</p>
                        <p className="text-sm font-bold">{stats.paidCreditCards}</p>
                      </div>
                    </div>
                  </div>

                  {/* Atividade recente */}
                  <div>
                    <h4 className="font-medium text-sm mb-3 flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-primary" />
                      <span>Atividade Recente</span>
                    </h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {stats.recentActivity.map((activity, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <div className="flex items-center space-x-2">
                            {getActivityIcon(activity.type)}
                            <div>
                              <p className="text-xs font-medium">{activity.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(activity.date), 'dd/MM - HH:mm', { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className="text-xs">
                              {getActivityLabel(activity.type)}
                            </Badge>
                            {activity.amount > 0 && (
                              <p className="text-xs font-medium mt-1">
                                {formatCurrency(activity.amount)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      {stats.recentActivity.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground">
                          <Activity className="w-6 h-6 mx-auto mb-2 opacity-50" />
                          <p className="text-xs">Nenhuma atividade recente</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {state.users.length === 0 && (
            <Card className="shadow-card">
              <CardContent className="p-12 text-center">
                <UsersIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">Nenhum usuário cadastrado</h3>
                <p className="text-muted-foreground mb-4">
                  Adicione usuários para começar a gestão colaborativa
                </p>
                <Button onClick={() => setShowForm(true)} className="bg-gradient-primary hover:opacity-90">
                  <Plus className="w-4 h-4 mr-2" />
                  Cadastrar Primeiro Usuário
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}