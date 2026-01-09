import { useState, useEffect } from 'react';
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
import { Plus, Calendar, DollarSign, CreditCard, Banknote, Layers, User, X } from 'lucide-react';

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

  const { month: selectedMonth, year: selectedYear } = state.selectedMonth;

  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  // --- OTIMIZAÇÃO MOBILE: Abre o formulário automaticamente se for celular ---
  useEffect(() => {
    const isMobile = window.innerWidth < 768; // 768px é o breakpoint padrão 'md'
    if (isMobile) {
      setShowForm(true);
    }
  }, []);

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
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(date));
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
    
    // No mobile, talvez você queira fechar após salvar, ou manter aberto para lançar outro.
    // Vou fechar por padrão para ver o resumo, mas o usuário pode clicar em "+" novamente.
    setShowForm(false); 
    
    toast({ title: "Gasto Salvo!", description: "Despesa registrada com sucesso." });
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

  const currentMonthExpenses = state.expenses
    .filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate.getMonth() === selectedMonth &&
        expenseDate.getFullYear() === selectedYear &&
        (expense.type === 'variavel' || expense.type === 'cartao_credito');
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const monthlyTotal = currentMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20">
      
      {/* HEADER E BOTÃO DE AÇÃO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Gastos Variáveis</h1>
          <p className="text-sm text-muted-foreground">
             Dados de <strong>{MONTH_NAMES[selectedMonth]}/{selectedYear}</strong>
          </p>
        </div>
        
        {/* Botão Novo Gasto - Full Width no Mobile */}
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="w-full md:w-auto bg-gradient-primary hover:opacity-90 h-12 md:h-10 text-base">
            <Plus className="w-5 h-5 mr-2" />
            Novo Gasto
          </Button>
        )}
      </div>

      {/* CARDS DE RESUMO - GRID 3 COLUNAS (Scroll horizontal ou quebra no mobile) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
        <Card className="shadow-card col-span-2 md:col-span-1">
          <CardContent className="p-4 md:p-6 flex items-center space-x-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">Total do Mês</p>
              <p className="text-xl md:text-2xl font-bold text-foreground">{formatCurrency(monthlyTotal)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 md:p-6 flex items-center space-x-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">Qtd. Gastos</p>
              <p className="text-xl md:text-2xl font-bold text-foreground">{currentMonthExpenses.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 md:p-6 flex items-center space-x-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5 md:w-6 md:h-6 text-green-500" />
            </div>
            <div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">Ticket Médio</p>
              <p className="text-xl md:text-2xl font-bold text-foreground">
                {formatCurrency(currentMonthExpenses.length > 0 ? monthlyTotal / currentMonthExpenses.length : 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FORMULÁRIO DE CADASTRO */}
      {showForm && (
        <Card className="shadow-card animate-in slide-in-from-top-4 border-primary/20">
          <CardHeader className="p-4 md:p-6 pb-2 md:pb-6 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg md:text-xl">Novo Gasto</CardTitle>
              <CardDescription className="text-xs md:text-sm">Preencha os detalhes da despesa</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} className="md:hidden">
              <X className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Data e Valor na mesma linha */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Data</Label>
                  <Input 
                    id="date" 
                    type="date" 
                    value={formData.date} 
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })} 
                    required 
                    className="h-11" // Toque facilitado
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor (R$)</Label>
                  <Input 
                    id="amount" 
                    type="number" 
                    step="0.01" 
                    placeholder="0,00"
                    value={formData.amount} 
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })} 
                    required 
                    className="h-11 font-bold"
                  />
                </div>
              </div>

              {/* Parcela Info (Se houver valor) */}
              {formData.installments !== '1' && formData.amount && (
                <div className="text-xs text-center p-2 bg-muted/50 rounded text-muted-foreground">
                  Serão {formData.installments}x de {formatCurrency(parseFloat(formData.amount) / parseInt(formData.installments))}
                </div>
              )}

              {/* Categoria e Pagamento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, category: value as ExpenseCategory })}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Pagamento</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as PaymentMethod })}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Forma de Pagto" /></SelectTrigger>
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

              {/* Parcelas (Condicional) */}
              {isCreditCard(formData.paymentMethod) && (
                 <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-dashed border-primary/20">
                    <Label className="flex items-center space-x-2 text-primary">
                        <Layers className="w-4 h-4" />
                        <span>Parcelamento</span>
                    </Label>
                    <div className="flex items-center space-x-4">
                        <Input 
                            type="number" 
                            min="1" 
                            max="36" 
                            value={formData.installments} 
                            onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                            className="w-20 h-10 text-center font-bold"
                        />
                        <span className="text-sm text-muted-foreground">
                            {formData.installments === '1' ? 'parcela (à vista)' : 'parcelas mensais'}
                        </span>
                    </div>
                 </div>
              )}

              {/* Usuário e Descrição */}
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Quem gastou?" /></SelectTrigger>
                  <SelectContent>
                    {state.users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição (Opcional)</Label>
                <Textarea 
                  id="description" 
                  placeholder="Detalhes da compra..." 
                  value={formData.description} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                  rows={2} 
                  className="resize-none"
                />
              </div>

              {/* Botões de Ação */}
              <div className="flex space-x-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-12">
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="flex-[2] h-12 bg-gradient-primary">
                  {loading ? 'Salvando...' : 'Confirmar Gasto'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* LISTA DE GASTOS */}
      <Card className="shadow-card border-none bg-transparent shadow-none md:border md:bg-card">
        <CardHeader className="px-0 md:px-6 py-2 md:py-6">
          <CardTitle className="text-lg md:text-xl">Histórico ({currentMonthExpenses.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 md:px-6">
          {currentMonthExpenses.length === 0 ? (
            <div className="text-center py-10 bg-card rounded-lg border border-dashed">
              <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Nenhum gasto neste mês</p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentMonthExpenses.map((expense) => (
                <div key={expense.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-card rounded-lg border shadow-sm">
                  
                  {/* Linha Superior Mobile: Categoria + Valor */}
                  <div className="flex justify-between items-start mb-2 md:mb-0 md:w-full">
                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {getCategoryLabel(expense.category as ExpenseCategory)}
                        </Badge>
                        {expense.installments && expense.installments.total > 1 && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1">
                            {expense.installments.current}/{expense.installments.total}
                          </Badge>
                        )}
                      </div>
                      <span className="font-semibold text-base md:text-lg text-foreground line-clamp-1">
                        {expense.description || 'Sem descrição'}
                      </span>
                    </div>
                    
                    {/* Valor em destaque no mobile */}
                    <span className="font-bold text-lg md:hidden">
                      {formatCurrency(expense.amount)}
                    </span>
                  </div>

                  {/* Linha Inferior: Detalhes + Valor Desktop */}
                  <div className="flex items-center justify-between w-full md:w-auto text-xs text-muted-foreground mt-1 md:mt-0">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
                        {getPaymentIcon(expense.paymentMethod)}
                        {getPaymentMethodLabel(expense.paymentMethod)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(expense.date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {getUserName(expense.userId).split(' ')[0]}
                      </span>
                    </div>

                    {/* Valor no Desktop */}
                    <span className="font-bold text-lg hidden md:block md:ml-6 min-w-[100px] text-right">
                      {formatCurrency(expense.amount)}
                    </span>
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