import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  CreditCard as CardIcon, Plus, Info, Calendar, X, Check, RotateCcw
} from 'lucide-react';
import { format, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

  const getCardMetrics = (card: any) => {
    const selectedDate = new Date(selectedYear, selectedMonth, 1);

    const currentMonthExpenses = state.expenses.filter(e => {
      const d = new Date(e.date);
      return e.paymentMethod === card.name && d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    }).reduce((sum, e) => sum + Number(e.amount), 0);

    const currentMonthFixed = getActiveFixedExpenses(selectedMonth, selectedYear)
      .filter(f => f.creditCardId === card.id && f.isPaid)
      .reduce((sum, f) => sum + Number(f.amount), 0);

    const billTotal = currentMonthExpenses + currentMonthFixed;

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
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20">
      
      {/* Header e Ações */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Cartões de Crédito</h1>
            <p className="text-sm text-muted-foreground">Gestão de faturas e limites</p>
          </div>
          
          <div className="flex w-full md:w-auto gap-2">
             {!showForm && (
               <Button onClick={() => setShowForm(true)} className="bg-gradient-primary shrink-0">
                 <Plus className="w-5 h-5 mr-1" /> <span className="hidden sm:inline">Novo Cartão</span>
               </Button>
             )}
          </div>
        </div>
      </div>

      {/* Resumo de Limites */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-card border-l-4 border-l-blue-500">
          <CardContent className="p-4 md:p-6 flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-muted-foreground">Limite Total Combinado</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalLimit)}</p>
            </div>
            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                <CardIcon className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formulário de Novo Cartão */}
      {showForm && (
        <Card className="shadow-card animate-in slide-in-from-top-4 border-primary/20">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Novo Cartão</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Nome do Cartão</Label>
                    <Input placeholder="Ex: Nubank, Visa..." value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required className="h-11" />
                </div>
                <div className="space-y-2">
                    <Label>Limite Total</Label>
                    <Input type="number" step="0.01" placeholder="0,00" value={formData.limit} onChange={(e) => setFormData({ ...formData, limit: e.target.value })} required className="h-11" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Dia Fechamento</Label>
                    <Input type="number" min="1" max="31" placeholder="Dia" value={formData.closingDay} onChange={(e) => setFormData({ ...formData, closingDay: e.target.value })} required className="h-11 text-center" />
                </div>
                <div className="space-y-2">
                    <Label>Dia Vencimento</Label>
                    <Input type="number" min="1" max="31" placeholder="Dia" value={formData.dueDay} onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })} required className="h-11 text-center" />
                </div>
              </div>
              
              <Button type="submit" disabled={loading} className="w-full h-11 bg-gradient-primary">
                {loading ? 'Salvando...' : 'Cadastrar Cartão'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de Cartões */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        {state.creditCards.map((card) => {
          const { billTotal, committedTotal, availableLimit } = getCardMetrics(card);
          const utilizationPercentage = card.limit > 0 ? (committedTotal / card.limit) * 100 : 0;

          return (
            <Card key={card.id} className={`shadow-card transition-all ${card.isPaid ? 'opacity-80 bg-muted/30' : ''}`}>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <CardIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base md:text-lg leading-none">{card.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">Limite: {formatCurrency(card.limit)}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={card.isPaid ? 'default' : 'outline'} className={card.isPaid ? 'bg-green-600 hover:bg-green-700' : ''}>
                    {card.isPaid ? 'Paga' : 'Aberta'}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="p-4 space-y-5">
                
                {/* Barra de Progresso */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      Utilizado (Total)
                    </span>
                    <span className="font-semibold">{formatCurrency(committedTotal)}</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        utilizationPercentage > 90 ? 'bg-red-500' : 
                        utilizationPercentage > 70 ? 'bg-orange-500' : 'bg-primary'
                      }`} 
                      style={{ width: `${Math.min(utilizationPercentage, 100)}%` }} 
                    />
                  </div>
                  <div className="flex justify-between text-[10px] md:text-xs">
                    <span className="text-muted-foreground">Disponível: <span className="text-green-600 font-medium">{formatCurrency(availableLimit)}</span></span>
                    <span className="font-medium">{utilizationPercentage.toFixed(0)}%</span>
                  </div>
                </div>

                {/* Info da Fatura Atual */}
                <div className="bg-card border rounded-lg p-3 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">
                      Fatura {format(new Date(selectedYear, selectedMonth, 1), 'MMM/yy', { locale: ptBR })}
                    </p>
                    <p className="text-xl font-bold text-foreground">{formatCurrency(billTotal)}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground space-y-0.5">
                    <div>Fecha: <span className="font-medium text-foreground">{card.closingDay}</span></div>
                    <div>Vence: <span className="font-medium text-foreground">{card.dueDay}</span></div>
                  </div>
                </div>

                {/* Ações de Pagamento */}
                <div className="pt-1">
                  {!card.isPaid ? (
                    <Select onValueChange={(userId) => handlePayment(card.id, userId)}>
                      <SelectTrigger className="w-full h-10 border-primary/30 hover:border-primary focus:ring-primary/20">
                        <SelectValue placeholder="Pagar Fatura" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Quem pagou?</div>
                        {state.users.map((user) => (
                          <SelectItem key={user.id} value={user.id} className="cursor-pointer">
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button 
                      variant="outline" 
                      onClick={() => handleUnpay(card.id)} 
                      className="w-full h-10 border-dashed text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" /> Reabrir Fatura
                    </Button>
                  )}
                </div>

              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}