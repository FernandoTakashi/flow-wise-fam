import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  ArrowUpCircle, 
  ArrowDownCircle,
  History,
  Settings
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardCard } from '@/components/DashboardCard';

type MovementType = 'income' | 'outcome';

export default function CashManagement() {
  const { state, dispatch, getCurrentBalance } = useFinance();
  const { toast } = useToast();
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    type: '' as MovementType,
    description: '',
    amount: '',
    userId: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.type || !formData.amount || !formData.userId || !formData.description) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    const newMovement = {
      id: Date.now().toString(),
      type: formData.type,
      description: formData.description,
      amount: parseFloat(formData.amount),
      userId: formData.userId,
      date: new Date(),
      createdAt: new Date()
    };

    dispatch({ type: 'ADD_CASH_MOVEMENT', payload: newMovement });

    toast({
      title: 'Sucesso!',
      description: `${formData.type === 'income' ? 'Entrada' : 'Saída'} registrada com sucesso`,
    });

    setFormData({
      type: '' as MovementType,
      description: '',
      amount: '',
      userId: ''
    });
    setShowForm(false);
  };

  const currentBalance = getCurrentBalance();
  const totalIncome = state.cashMovements
    .filter(movement => movement.type === 'income')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalOutcome = state.cashMovements
    .filter(movement => movement.type === 'outcome')
    .reduce((sum, movement) => sum + movement.amount, 0);

  // Projeção com rendimento
  const projectedBalance = currentBalance * (1 + state.settings.monthlyYield / 100);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestão de Caixa</h1>
          <p className="text-muted-foreground">
            Controle de entradas, saídas e saldo disponível
          </p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-primary hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? 'Cancelar' : 'Nova Movimentação'}
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <DashboardCard
          title="Saldo Atual"
          value={formatCurrency(currentBalance)}
          description="Disponível em caixa"
          icon={<Wallet className="w-6 h-6" />}
          variant={currentBalance > 0 ? 'success' : 'danger'}
        />
        
        <DashboardCard
          title="Total de Entradas"
          value={formatCurrency(totalIncome)}
          description="Receitas acumuladas"
          icon={<ArrowUpCircle className="w-6 h-6" />}
          variant="success"
        />
        
        <DashboardCard
          title="Total de Saídas"
          value={formatCurrency(totalOutcome)}
          description="Gastos acumulados"
          icon={<ArrowDownCircle className="w-6 h-6" />}
          variant="danger"
        />
        
        <DashboardCard
          title="Projeção c/ Rendimento"
          value={formatCurrency(projectedBalance)}
          description={`${state.settings.monthlyYield}% ao mês`}
          icon={<TrendingUp className="w-6 h-6" />}
          variant="success"
          trend="up"
          trendValue={`+${(projectedBalance - currentBalance).toFixed(2)}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário de nova movimentação */}
        {showForm && (
          <Card className="shadow-card lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-primary" />
                <span>Nova Movimentação</span>
              </CardTitle>
              <CardDescription>Registrar entrada ou saída de dinheiro</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, type: value as MovementType })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Entrada ou saída" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">
                        <div className="flex items-center space-x-2">
                          <ArrowUpCircle className="w-4 h-4 text-success" />
                          <span>Entrada</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="outcome">
                        <div className="flex items-center space-x-2">
                          <ArrowDownCircle className="w-4 h-4 text-destructive" />
                          <span>Saída</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Valor *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Usuário Responsável *</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Quem fez a movimentação" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição *</Label>
                  <Textarea
                    id="description"
                    placeholder="Ex: Salário, Depósito, Saque..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                    rows={3}
                  />
                </div>

                <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90">
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar Movimentação
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Histórico de movimentações */}
        <Card className={`shadow-card ${showForm ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <History className="w-5 h-5 text-primary" />
              <span>Histórico de Movimentações</span>
            </CardTitle>
            <CardDescription>
              Todas as entradas e saídas de dinheiro
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {state.cashMovements
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((movement) => {
                  const user = state.users.find(u => u.id === movement.userId);
                  return (
                    <div 
                      key={movement.id} 
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          movement.type === 'income' ? 'bg-success/20' : 'bg-destructive/20'
                        }`}>
                          {movement.type === 'income' ? (
                            <ArrowUpCircle className="w-5 h-5 text-success" />
                          ) : (
                            <ArrowDownCircle className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{movement.description}</p>
                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                            <span>{user?.name || 'Usuário não encontrado'}</span>
                            <span>•</span>
                            <span>{format(new Date(movement.date), 'dd/MM/yyyy - HH:mm', { locale: ptBR })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${
                          movement.type === 'income' ? 'text-success' : 'text-destructive'
                        }`}>
                          {movement.type === 'income' ? '+' : '-'}{formatCurrency(movement.amount)}
                        </p>
                        <Badge 
                          variant={movement.type === 'income' ? 'default' : 'secondary'} 
                          className="text-xs"
                        >
                          {movement.type === 'income' ? 'Entrada' : 'Saída'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              
              {state.cashMovements.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">Nenhuma movimentação registrada</p>
                  <p className="text-sm">Clique em "Nova Movimentação" para começar</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configurações de rendimento */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-primary" />
            <span>Configurações de Rendimento</span>
          </CardTitle>
          <CardDescription>
            Configure o percentual de rendimento mensal para projeções
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Label htmlFor="yield">Rendimento Mensal (%)</Label>
              <Input
                id="yield"
                type="number"
                step="0.01"
                value={state.settings.monthlyYield}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  dispatch({
                    type: 'UPDATE_SETTINGS',
                    payload: { monthlyYield: value }
                  });
                }}
                className="mt-1"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Rendimento atual: <span className="font-medium">{state.settings.monthlyYield}%</span></p>
              <p>Projeção: <span className="font-medium text-success">{formatCurrency(projectedBalance - currentBalance)}</span></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}