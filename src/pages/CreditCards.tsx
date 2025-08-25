import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  CreditCard, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Calendar,
  DollarSign,
  Trash2,
  User
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CreditCards() {
  const { state, dispatch } = useFinance();
  const { toast } = useToast();
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    limit: '',
    closingDay: '',
    dueDay: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.limit || !formData.closingDay || !formData.dueDay) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    const newCard = {
      id: Date.now().toString(),
      name: formData.name,
      limit: parseFloat(formData.limit),
      closingDay: parseInt(formData.closingDay),
      dueDay: parseInt(formData.dueDay),
      isPaid: false,
      createdAt: new Date()
    };

    dispatch({ type: 'ADD_CREDIT_CARD', payload: newCard });

    toast({
      title: 'Sucesso!',
      description: 'Cartão de crédito cadastrado com sucesso',
    });

    setFormData({
      name: '',
      limit: '',
      closingDay: '',
      dueDay: ''
    });
    setShowForm(false);
  };

  const handlePayment = (cardId: string, userId: string) => {
    dispatch({
      type: 'UPDATE_CREDIT_CARD',
      payload: {
        id: cardId,
        updates: {
          isPaid: true,
          paidBy: userId,
          paidAt: new Date()
        }
      }
    });

    toast({
      title: 'Pagamento registrado!',
      description: 'Fatura marcada como paga',
    });
  };

  const handleUnpay = (cardId: string) => {
    dispatch({
      type: 'UPDATE_CREDIT_CARD',
      payload: {
        id: cardId,
        updates: {
          isPaid: false,
          paidBy: undefined,
          paidAt: undefined
        }
      }
    });

    toast({
      title: 'Pagamento desfeito',
      description: 'Fatura marcada como pendente',
    });
  };

  // Calcular gastos por cartão no mês atual
  const getCardExpenses = (cardName: string) => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    return state.expenses
      .filter(expense => {
        const expenseDate = new Date(expense.date);
        return expense.paymentMethod === cardName &&
               expenseDate.getMonth() === currentMonth &&
               expenseDate.getFullYear() === currentYear;
      })
      .reduce((sum, expense) => sum + expense.amount, 0);
  };

  const totalCards = state.creditCards.length;
  const paidCards = state.creditCards.filter(card => card.isPaid).length;
  const pendingCards = totalCards - paidCards;
  const totalLimit = state.creditCards.reduce((sum, card) => sum + card.limit, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Cartões de Crédito</h1>
          <p className="text-muted-foreground">
            Gestão de cartões e controle de faturas
          </p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-primary hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? 'Cancelar' : 'Novo Cartão'}
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-card bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Cartões</p>
                <p className="text-2xl font-bold text-foreground">{totalCards}</p>
              </div>
              <CreditCard className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Faturas Pagas</p>
                <p className="text-2xl font-bold text-foreground">{paidCards}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Faturas Pendentes</p>
                <p className="text-2xl font-bold text-foreground">{pendingCards}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Limite Total</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalLimit)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário de novo cartão */}
        {showForm && (
          <Card className="shadow-card lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-primary" />
                <span>Novo Cartão</span>
              </CardTitle>
              <CardDescription>Cadastrar um novo cartão de crédito</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Cartão *</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Nubank, Itaú, C6 Bank..."
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="limit">Limite *</Label>
                  <Input
                    id="limit"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formData.limit}
                    onChange={(e) => setFormData({ ...formData, limit: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="closing">Fechamento</Label>
                    <Input
                      id="closing"
                      type="number"
                      min="1"
                      max="31"
                      placeholder="Dia"
                      value={formData.closingDay}
                      onChange={(e) => setFormData({ ...formData, closingDay: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due">Vencimento</Label>
                    <Input
                      id="due"
                      type="number"
                      min="1"
                      max="31"
                      placeholder="Dia"
                      value={formData.dueDay}
                      onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90">
                  <Plus className="w-4 h-4 mr-2" />
                  Cadastrar Cartão
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Lista de cartões */}
        <div className={`space-y-4 ${showForm ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {state.creditCards.map((card) => {
            const cardExpenses = getCardExpenses(card.name);
            const utilizationPercentage = (cardExpenses / card.limit) * 100;
            const paidByUser = card.paidBy ? state.users.find(u => u.id === card.paidBy) : null;

            return (
              <Card key={card.id} className="shadow-card hover:shadow-card-hover transition-all duration-300">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        card.isPaid ? 'bg-success/20' : 'bg-warning/20'
                      }`}>
                        <CreditCard className={`w-6 h-6 ${
                          card.isPaid ? 'text-success' : 'text-warning'
                        }`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{card.name}</CardTitle>
                        <CardDescription>
                          Limite: {formatCurrency(card.limit)}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={card.isPaid ? 'default' : 'secondary'}>
                      {card.isPaid ? 'Paga' : 'Pendente'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Informações do cartão */}
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Fechamento</p>
                        <p className="text-sm font-medium">Dia {card.closingDay}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Vencimento</p>
                        <p className="text-sm font-medium">Dia {card.dueDay}</p>
                      </div>
                    </div>
                  </div>

                  {/* Fatura atual */}
                  <div className="p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Fatura Atual</p>
                      <p className="text-lg font-bold">{formatCurrency(cardExpenses)}</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          utilizationPercentage > 80 ? 'bg-destructive' : 
                          utilizationPercentage > 50 ? 'bg-warning' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {utilizationPercentage.toFixed(1)}% do limite utilizado
                    </p>
                  </div>

                  {/* Status do pagamento */}
                  {card.isPaid && card.paidBy && card.paidAt && (
                    <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                      <div className="flex items-center space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-success" />
                        <p className="text-sm font-medium text-success">Fatura paga</p>
                      </div>
                      <div className="flex items-center space-x-2 mt-1 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{paidByUser?.name}</span>
                        <span>•</span>
                        <span>{format(new Date(card.paidAt), 'dd/MM/yyyy - HH:mm', { locale: ptBR })}</span>
                      </div>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex space-x-2">
                    {!card.isPaid ? (
                      <Select onValueChange={(userId) => handlePayment(card.id, userId)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Marcar como paga por..." />
                        </SelectTrigger>
                        <SelectContent>
                          {state.users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Button 
                        variant="outline" 
                        onClick={() => handleUnpay(card.id)}
                        className="flex-1"
                      >
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Marcar como pendente
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {state.creditCards.length === 0 && (
            <Card className="shadow-card">
              <CardContent className="p-12 text-center">
                <CreditCard className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">Nenhum cartão cadastrado</h3>
                <p className="text-muted-foreground mb-4">
                  Adicione seus cartões de crédito para controlar as faturas
                </p>
                <Button onClick={() => setShowForm(true)} className="bg-gradient-primary hover:opacity-90">
                  <Plus className="w-4 h-4 mr-2" />
                  Cadastrar Primeiro Cartão
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}