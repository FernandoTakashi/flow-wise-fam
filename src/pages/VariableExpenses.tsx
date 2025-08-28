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
import { ExpenseCategory, PaymentMethod } from '@/types';
import { Plus, Calendar, DollarSign, User, CreditCard, Banknote } from 'lucide-react';

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'lazer', label: 'Lazer' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'moradia', label: 'Moradia' },
  { value: 'vestuario', label: 'Vestuário' },
  { value: 'outros', label: 'Outros' }
];

export default function VariableExpenses() {
  const { state, dispatch } = useFinance();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '' as ExpenseCategory,
    description: '',
    amount: '',
    paymentMethod: '' as PaymentMethod,
    userId: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.category || !formData.paymentMethod || !formData.userId || !formData.amount) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    const newExpense = {
      id: Date.now().toString(),
      date: new Date(formData.date),
      category: formData.category,
      type: 'variavel' as const,
      paymentMethod: formData.paymentMethod,
      description: formData.description,
      amount: parseFloat(formData.amount),
      userId: formData.userId,
      createdAt: new Date()
    };

    dispatch({ type: 'ADD_EXPENSE', payload: newExpense });

    toast({
      title: 'Sucesso!',
      description: 'Gasto variável cadastrado com sucesso'
    });

    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: '' as ExpenseCategory,
      description: '',
      amount: '',
      paymentMethod: '' as PaymentMethod,
      userId: ''
    });
    setShowForm(false);
  };

  const getCategoryLabel = (category: ExpenseCategory) => {
    return categories.find(cat => cat.value === category)?.label || category;
  };

  const getUserName = (userId: string) => {
    return state.users.find(user => user.id === userId)?.name || 'Usuário';
  };

  const getPaymentMethodLabel = (method: PaymentMethod) => {
    switch (method) {
      case 'dinheiro':
        return 'Dinheiro';
      case 'debito':
        return 'Débito';
      case 'pix':
        return 'PIX';
      default:
        return method; // Para cartões de crédito, retorna o nome do cartão
    }
  };

  const getPaymentIcon = (method: PaymentMethod) => {
    if (['dinheiro', 'debito', 'pix'].includes(method)) {
      return <Banknote className="w-4 h-4" />;
    }
    return <CreditCard className="w-4 h-4" />;
  };

  const currentMonthExpenses = state.expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      const currentDate = new Date();
      return expenseDate.getMonth() === currentDate.getMonth() && 
             expenseDate.getFullYear() === currentDate.getFullYear() &&
             expense.type === 'variavel';
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const monthlyTotal = currentMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gastos Variáveis</h1>
          <p className="text-muted-foreground">
            Registre despesas avulsas e esporádicas
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" />
          Novo Gasto Variável
        </Button>
      </div>

      {/* Resumo do Mês */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-primary/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total do Mês</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(monthlyTotal)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Gastos Registrados</p>
                <p className="text-2xl font-bold text-foreground">
                  {currentMonthExpenses.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Banknote className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Média por Gasto</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(currentMonthExpenses.length > 0 ? monthlyTotal / currentMonthExpenses.length : 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formulário */}
      {showForm && (
        <Card className="shadow-card animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Plus className="w-5 h-5 text-primary" />
              <span>Cadastrar Gasto Variável</span>
            </CardTitle>
            <CardDescription>
              Registre despesas esporádicas e avulsas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Data *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
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
                  <Label>Categoria *</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, category: value as ExpenseCategory })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Forma de Pagamento *</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as PaymentMethod })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Como foi pago" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                      <SelectItem value="debito">💳 Débito</SelectItem>
                      <SelectItem value="pix">📱 PIX</SelectItem>
                      {state.creditCards.map((card) => (
                        <SelectItem key={card.id} value={card.name}>
                          🔳 {card.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Usuário Responsável *</Label>
                <Select onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Quem fez o gasto" />
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
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva o gasto (opcional)"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex space-x-4 pt-4">
                <Button type="submit" className="bg-gradient-primary hover:opacity-90">
                  <Plus className="w-4 h-4 mr-2" />
                  Cadastrar
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de Gastos */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Gastos do Mês Atual</CardTitle>
          <CardDescription>
            Histórico de gastos variáveis registrados neste mês
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentMonthExpenses.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Nenhum gasto registrado
              </h3>
              <p className="text-muted-foreground mb-4">
                Registre seus primeiros gastos variáveis do mês
              </p>
              <Button onClick={() => setShowForm(true)} className="bg-gradient-primary hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Registrar Primeiro Gasto
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {currentMonthExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <Badge variant="outline">
                        {getCategoryLabel(expense.category)}
                      </Badge>
                      <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                        {getPaymentIcon(expense.paymentMethod)}
                        <span>{getPaymentMethodLabel(expense.paymentMethod)}</span>
                      </div>
                    </div>
                    
                    <p className="font-medium text-foreground mb-1">
                      {expense.description || 'Sem descrição'}
                    </p>
                    
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(expense.date)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <User className="w-4 h-4" />
                        <span>{getUserName(expense.userId)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-semibold text-foreground">
                      {formatCurrency(expense.amount)}
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