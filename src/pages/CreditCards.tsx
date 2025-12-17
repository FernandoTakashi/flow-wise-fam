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
  CreditCard as CardIcon, Plus, CheckCircle2, AlertCircle, Calendar, DollarSign, User, Info
} from 'lucide-react';
import { format, isAfter, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MonthSelector from '@/components/MonthSelector';

export default function CreditCards() {
  const { state, addCreditCard, updateCreditCard, getActiveFixedExpenses } = useFinance();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { month: selectedMonth, year: selectedYear } = state.selectedMonth;

  const [formData, setFormData] = useState({
    name: '',
    limit: '',
    closingDay: '',
    dueDay: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // Lógica de Cálculo de Comprometimento de Limite
  const getCardMetrics = (card: any) => {
    const selectedDate = new Date(selectedYear, selectedMonth, 1);

    // 1. Fatura do Mês Selecionado (O que aparece no Dashboard)
    const currentMonthExpenses = state.expenses.filter(e => {
      const d = new Date(e.date);
      return e.paymentMethod === card.name && d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    }).reduce((sum, e) => sum + Number(e.amount), 0);

    const currentMonthFixed = getActiveFixedExpenses(selectedMonth, selectedYear)
      .filter(f => f.creditCardId === card.id && f.isPaid)
      .reduce((sum, f) => sum + Number(f.amount), 0);

    const billTotal = currentMonthExpenses + currentMonthFixed;

    // 2. Limite Comprometido (Total de parcelas de agora para o futuro)
    // Regra: Soma tudo que tem data >= primeiro dia do mês selecionado
    const committedExpenses = state.expenses.filter(e => {
      const d = new Date(e.date);
      return e.paymentMethod === card.name && (isAfter(d, selectedDate) || d.getTime() === selectedDate.getTime());
    }).reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      billTotal,
      committedTotal: committedExpenses,
      availableLimit: card.limit - committedExpenses
    };
  };

  // Resto das funções mantidas...
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.limit || !formData.closingDay || !formData.dueDay) return;
    setLoading(true);
    await addCreditCard({
      name: formData.name, limit: parseFloat(formData.limit),
      closingDay: parseInt(formData.closingDay), dueDay: parseInt(formData.dueDay),
      isPaid: false
    });
    setLoading(false);
    setFormData({ name: '', limit: '', closingDay: '', dueDay: '' });
    setShowForm(false);
  };

  const handlePayment = async (cardId: string, userId: string) => {
    await updateCreditCard(cardId, { isPaid: true, paidBy: userId, paidAt: new Date() });
    toast({ title: 'Pagamento registrado!' });
  };

  const handleUnpay = async (cardId: string) => {
    await updateCreditCard(cardId, { isPaid: false, paidBy: undefined, paidAt: undefined });
    toast({ title: 'Pagamento desfeito' });
  };

  const totalLimit = state.creditCards.reduce((sum, card) => sum + card.limit, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Cartões de Crédito</h1>
          <p className="text-muted-foreground">O limite disponível considera parcelas futuras</p>
        </div>
        <div className="flex items-center gap-2">
          <MonthSelector />
          <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary">
            <Plus className="w-4 h-4 mr-2" /> Novo Cartão
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-card border-l-4 border-l-blue-500">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Limite Total</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalLimit)}</p>
          </CardContent>
        </Card>
        {/* Outros cards de resumo podem ser adicionados aqui */}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {showForm && (
          <Card className="shadow-card lg:col-span-1">
            <CardHeader><CardTitle>Novo Cartão</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Nome</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Limite</Label><Input type="number" step="0.01" value={formData.limit} onChange={(e) => setFormData({ ...formData, limit: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Fechamento</Label><Input type="number" min="1" max="31" value={formData.closingDay} onChange={(e) => setFormData({ ...formData, closingDay: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Vencimento</Label><Input type="number" min="1" max="31" value={formData.dueDay} onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })} required /></div>
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary">Salvar</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className={`space-y-4 ${showForm ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {state.creditCards.map((card) => {
            const { billTotal, committedTotal, availableLimit } = getCardMetrics(card);
            const utilizationPercentage = card.limit > 0 ? (committedTotal / card.limit) * 100 : 0;

            return (
              <Card key={card.id} className="shadow-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CardIcon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{card.name}</CardTitle>
                        <CardDescription>Limite total: {formatCurrency(card.limit)}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={card.isPaid ? 'default' : 'secondary'}>{card.isPaid ? 'Paga' : 'Aberta'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Visualização de Limite */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Info className="w-3 h-3" /> Limite Utilizado (com parcelas futuras)
                      </span>
                      <span className="font-bold">{formatCurrency(committedTotal)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all ${utilizationPercentage > 90 ? 'bg-red-500' : utilizationPercentage > 70 ? 'bg-orange-500' : 'bg-primary'}`} 
                        style={{ width: `${Math.min(utilizationPercentage, 100)}%` }} 
                      />
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-muted-foreground">Disponível: {formatCurrency(availableLimit)}</span>
                      <span className="font-medium text-primary">{utilizationPercentage.toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 text-center">
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Fatura de {format(new Date(selectedYear, selectedMonth, 1), 'MMMM', { locale: ptBR })}</p>
                      <p className="text-2xl font-black text-primary mt-1">{formatCurrency(billTotal)}</p>
                    </div>

                    <div className="flex flex-col justify-center space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Fechamento:</span>
                        <span className="font-medium">Dia {card.closingDay}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Vencimento:</span>
                        <span className="font-medium">Dia {card.dueDay}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    {!card.isPaid ? (
                      <Select onValueChange={(userId) => handlePayment(card.id, userId)}>
                        <SelectTrigger className="flex-1 border-primary/20 hover:bg-primary/5">
                          <SelectValue placeholder="Pagar Fatura como..." />
                        </SelectTrigger>
                        <SelectContent>
                          {state.users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Button variant="outline" onClick={() => handleUnpay(card.id)} className="flex-1 border-red-200 text-red-600 hover:bg-red-50">
                        <AlertCircle className="w-4 h-4 mr-2" /> Reabrir Fatura
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}