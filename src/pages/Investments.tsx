import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, TrendingUp, DollarSign, CalendarIcon, Percent, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Investments() {
  const { state, dispatch } = useFinance();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showInitialForm, setShowInitialForm] = useState(false);

  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    userId: '',
    date: new Date()
  });

  const [initialSettings, setInitialSettings] = useState({
    initialInvestment: state.settings.initialInvestment.toString(),
    monthlyYield: state.settings.monthlyYield.toString()
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getTotalInvestments = () => {
    return state.settings.initialInvestment + 
           state.investments.reduce((sum, investment) => sum + investment.amount, 0);
  };

  const getMonthlyYield = () => {
    const totalInvestments = getTotalInvestments();
    return totalInvestments * (state.settings.monthlyYield / 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.description || !formData.amount || !formData.userId) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    const newInvestment = {
      id: crypto.randomUUID(),
      description: formData.description,
      amount: parseFloat(formData.amount),
      date: formData.date,
      userId: formData.userId,
      createdAt: new Date()
    };

    dispatch({ type: 'ADD_INVESTMENT', payload: newInvestment });

    toast({
      title: 'Sucesso!',
      description: 'Investimento registrado com sucesso'
    });

    setFormData({ description: '', amount: '', userId: '', date: new Date() });
    setShowForm(false);
  };

  const handleUpdateSettings = () => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        initialInvestment: parseFloat(initialSettings.initialInvestment) || 0,
        monthlyYield: parseFloat(initialSettings.monthlyYield) || 0
      }
    });

    toast({
      title: 'Configurações atualizadas!',
      description: 'Valor inicial e rendimento foram alterados'
    });

    setShowInitialForm(false);
  };

  const getUserName = (userId: string) => {
    return state.users.find(user => user.id === userId)?.name || 'Usuário';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Investimentos</h1>
          <p className="text-muted-foreground">
            Gerencie seus investimentos e acompanhe o rendimento mensal
          </p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => setShowInitialForm(!showInitialForm)} variant="outline">
            <Percent className="w-4 h-4 mr-2" />
            Configurações
          </Button>
          <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
            <Plus className="w-4 h-4 mr-2" />
            Nova Aplicação
          </Button>
        </div>
      </div>

      {/* Resumo dos Investimentos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <PiggyBank className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Investido</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(getTotalInvestments())}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Rendimento Mensal</p>
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(getMonthlyYield())}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <Percent className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Taxa Mensal</p>
                <p className="text-2xl font-bold text-foreground">
                  {state.settings.monthlyYield}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configurações Iniciais */}
      {showInitialForm && (
        <Card className="shadow-card animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Percent className="w-5 h-5 text-primary" />
              <span>Configurações de Investimento</span>
            </CardTitle>
            <CardDescription>
              Defina o valor inicial já investido e a taxa de rendimento mensal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="initialInvestment">Valor Inicial Investido</Label>
                <Input
                  id="initialInvestment"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={initialSettings.initialInvestment}
                  onChange={(e) => setInitialSettings({ 
                    ...initialSettings, 
                    initialInvestment: e.target.value 
                  })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthlyYield">Rendimento Mensal (%)</Label>
                <Input
                  id="monthlyYield"
                  type="number"
                  step="0.01"
                  placeholder="Ex: 0.5"
                  value={initialSettings.monthlyYield}
                  onChange={(e) => setInitialSettings({ 
                    ...initialSettings, 
                    monthlyYield: e.target.value 
                  })}
                />
              </div>
            </div>

            <div className="flex space-x-4 pt-4">
              <Button onClick={handleUpdateSettings} className="bg-gradient-primary hover:opacity-90">
                Salvar Configurações
              </Button>
              <Button variant="outline" onClick={() => setShowInitialForm(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulário de Nova Aplicação */}
      {showForm && (
        <Card className="shadow-card animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Plus className="w-5 h-5 text-primary" />
              <span>Nova Aplicação</span>
            </CardTitle>
            <CardDescription>
              Registre uma nova aplicação em seus investimentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição *</Label>
                  <Input
                    id="description"
                    placeholder="Ex: Aplicação CDB, Tesouro Direto"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Responsável *</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o responsável" />
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
                  <Label>Data da Aplicação</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.date ? format(formData.date, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.date}
                        onSelect={(date) => date && setFormData({ ...formData, date })}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <Button type="submit" className="bg-gradient-primary hover:opacity-90">
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar Aplicação
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de Investimentos */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Histórico de Aplicações</CardTitle>
          <CardDescription>
            Todas as aplicações realizadas em ordem cronológica
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.investments.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Nenhuma aplicação registrada
              </h3>
              <p className="text-muted-foreground mb-4">
                Registre suas aplicações para acompanhar o crescimento dos investimentos
              </p>
              <Button onClick={() => setShowForm(true)} className="bg-gradient-primary hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Primeira Aplicação
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {state.investments
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((investment) => (
                <div key={investment.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-1">
                      <h3 className="font-semibold text-foreground">
                        {investment.description}
                      </h3>
                      <Badge variant="outline">
                        {getUserName(investment.userId)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(investment.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-success">
                      +{formatCurrency(investment.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}