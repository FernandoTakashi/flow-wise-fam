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
import { Plus, Calendar, DollarSign, CreditCard, Banknote, Layers, User } from 'lucide-react';

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'lazer', label: 'Lazer' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'moradia', label: 'Moradia' },
  { value: 'vestuario', label: 'Vestuário' },
  { value: 'presente', label: 'Presente' },
  { value: 'outros', label: 'Outros' }
];

export default function VariableExpenses() {
  const { state, addExpense, getUserName } = useFinance();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Pega o Mês e Ano selecionados no Global State
  const { month: selectedMonth, year: selectedYear } = state.selectedMonth;

  // Array de nomes para exibir no título
  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '' as ExpenseCategory,
    description: '',
    amount: '',
    paymentMethod: '' as PaymentMethod,
    userId: '',
    installments: '1'
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
  };

  const isCreditCard = (method: string) => {
    return !['dinheiro', 'debito', 'pix', ''].includes(method);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.category || !formData.paymentMethod || !formData.userId || !formData.amount) {
      toast({ title: 'Erro', description: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    setLoading(true);

    const isCard = isCreditCard(formData.paymentMethod);
    const expenseType = isCard ? 'cartao_credito' : 'variavel';
    const numInstallments = isCard ? parseInt(formData.installments) : 1;

    await addExpense({
      date: new Date(formData.date),
      category: formData.category,
      type: expenseType,
      paymentMethod: formData.paymentMethod,
      description: formData.description,
      amount: parseFloat(formData.amount),
      userId: formData.userId,
      installments: {
        current: 1,
        total: numInstallments
      }
    });

    setLoading(false);

    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: '' as ExpenseCategory,
      description: '',
      amount: '',
      paymentMethod: '' as PaymentMethod,
      userId: '',
      installments: '1'
    });
    setShowForm(false);
  };

  const getCategoryLabel = (category: ExpenseCategory) => {
    return categories.find(cat => cat.value === category)?.label || category;
  };

  const getPaymentMethodLabel = (method: PaymentMethod) => {
    switch (method) {
      case 'dinheiro': return 'Dinheiro';
      case 'debito': return 'Débito';
      case 'pix': return 'PIX';
      default: return method;
    }
  };

  const getPaymentIcon = (method: PaymentMethod) => {
    if (['dinheiro', 'debito', 'pix'].includes(method)) return <Banknote className="w-4 h-4" />;
    return <CreditCard className="w-4 h-4" />;
  };

  // --- CORREÇÃO AQUI ---
  // Antes você usava "new Date()". Agora usamos selectedMonth e selectedYear
  const currentMonthExpenses = state.expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      
      // Compara com o estado global, não com o relógio do PC
      return expenseDate.getMonth() === selectedMonth &&
        expenseDate.getFullYear() === selectedYear &&
        (expense.type === 'variavel' || expense.type === 'cartao_credito');
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const monthlyTotal = currentMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gastos Variáveis</h1>
          <p className="text-muted-foreground">
             Mostrando dados de <strong>{MONTH_NAMES[selectedMonth]}/{selectedYear}</strong>
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? 'Cancelar' : 'Novo Gasto'}
        </Button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-primary/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total em {MONTH_NAMES[selectedMonth]}</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(monthlyTotal)}</p>
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
                <p className="text-2xl font-bold text-foreground">{currentMonthExpenses.length}</p>
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
            <CardTitle>Cadastrar Gasto</CardTitle>
            <CardDescription>Registre despesas ou compras no cartão</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Data da Compra *</Label>
                  <Input id="date" type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} required />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor Total *</Label>
                  <Input id="amount" type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required />
                  {formData.installments !== '1' && formData.amount && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Serão {formData.installments}x de {formatCurrency(parseFloat(formData.amount) / parseInt(formData.installments))}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria *</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, category: value as ExpenseCategory })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Forma de Pagamento *</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as PaymentMethod })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                      <SelectItem value="debito">💳 Débito</SelectItem>
                      <SelectItem value="pix">📱 PIX</SelectItem>
                      {state.creditCards.map((card) => (
                        <SelectItem key={card.id} value={card.name}>🔳 {card.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isCreditCard(formData.paymentMethod) && (
                 <div className="space-y-2 bg-muted/30 p-3 rounded-lg border border-dashed border-border">
                    <Label className="flex items-center space-x-2">
                        <Layers className="w-4 h-4" />
                        <span>Número de Parcelas</span>
                    </Label>
                    <div className="flex items-center space-x-4">
                        <Input 
                            type="number" 
                            min="1" 
                            max="36" 
                            value={formData.installments} 
                            onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                            className="w-24"
                        />
                        <div className="text-sm text-muted-foreground">
                            {formData.installments === '1' ? 'Pagamento à vista' : 'Parcelamento mensal automático'}
                        </div>
                    </div>
                 </div>
              )}

              <div className="space-y-2">
                <Label>Usuário Responsável *</Label>
                <Select onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                  <SelectTrigger><SelectValue placeholder="Quem fez o gasto" /></SelectTrigger>
                  <SelectContent>
                    {state.users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea id="description" placeholder="Ex: Tênis novo, Jantar..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
              </div>

              <div className="flex space-x-4 pt-4">
                <Button type="submit" disabled={loading} className="bg-gradient-primary">
                  {loading ? 'Processando...' : 'Salvar Gasto'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de Gastos */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Gastos de {MONTH_NAMES[selectedMonth]}</CardTitle>
          <CardDescription>Histórico de gastos variáveis e parcelas de cartão</CardDescription>
        </CardHeader>
        <CardContent>
          {currentMonthExpenses.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p>Nenhum gasto registrado em {MONTH_NAMES[selectedMonth]}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentMonthExpenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <Badge variant="outline">
                        {getCategoryLabel(expense.category as ExpenseCategory)}
                      </Badge>
                      <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                        {getPaymentIcon(expense.paymentMethod)}
                        <span>{getPaymentMethodLabel(expense.paymentMethod)}</span>
                      </div>
                      {expense.installments && expense.installments.total > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            {expense.installments.current}/{expense.installments.total}
                          </Badge>
                      )}
                    </div>
                    <p className="font-medium">{expense.description || 'Sem descrição'}</p>
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
                    <p className="text-lg font-semibold">{formatCurrency(expense.amount)}</p>
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