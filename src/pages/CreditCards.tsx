import { useState, useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  CreditCard as CardIcon, Plus, X, Check, FileText, ChevronDown, ChevronUp, Wallet, TrendingUp, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CreditCards() {
  const { state, addCreditCard, payCreditCardBill } = useFinance();
  const { toast } = useToast();
  
  const [showForm, setShowForm] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
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

  // --- LÓGICA DE CÁLCULO INDIVIDUAL (Separando Atual x Previsto) ---
  const calculateCardMetrics = (card: any) => {
    const extractList: any[] = []; 

    const getBillForDate = (date: Date) => {
        const d = new Date(date);
        let m = d.getMonth();
        let y = d.getFullYear();
        if (d.getDate() >= card.closingDay) {
            m++;
            if (m > 11) { m = 0; y++; }
        }
        return { m, y };
    };

    const isDateInSelectedBill = (date: Date) => {
        const { m, y } = getBillForDate(date);
        return m === selectedMonth && y === selectedYear;
    };

    const paymentMap = new Map();
    state.fixedPayments.forEach(p => {
        if(p.generatedExpenseId) paymentMap.set(p.generatedExpenseId, p);
    });

    // 1. SOMA ATUAL (O que já consta como lançamento ou pago)
    const currentBillTotal = state.expenses.reduce((sum, e) => {
        if (e.paymentMethod !== card.name) return sum;

        let dateToConsider = new Date(e.date);
        const linkedPayment = paymentMap.get(e.id);
        let type = "Variável";

        if (linkedPayment) {
            dateToConsider = new Date(linkedPayment.paidAt);
            type = "Fixo (Pago)";
        }

        if (isDateInSelectedBill(dateToConsider)) {
            extractList.push({ id: e.id, name: e.description, date: dateToConsider, amount: Number(e.amount), type, isProjected: false });
            return sum + Number(e.amount);
        }
        return sum;
    }, 0);

    // 2. SOMA PREVISTO (O que ainda vai cair)
    const paidKeys = state.fixedPayments.map(p => `${p.fixedExpenseId}-${p.month}-${p.year}`);

    const sumPending = (refMonth: number, refYear: number) => {
        return state.fixedExpenses.reduce((sum, f) => {
            if (f.creditCardId !== card.id) return sum;
            const checkDate = new Date(refYear, refMonth, 1);
            const from = new Date(f.effectiveFrom);
            if (from > checkDate) return sum;
            if (f.effectiveUntil && new Date(f.effectiveUntil) < checkDate) return sum;
            if (paidKeys.includes(`${f.id}-${refMonth}-${refYear}`)) return sum;

            const theoreticalDate = new Date(refYear, refMonth, f.dueDay);
            if (isDateInSelectedBill(theoreticalDate)) {
                 extractList.push({ id: f.id, name: f.name, date: theoreticalDate, amount: Number(f.amount), type: "Fixo (Previsto)", isProjected: true });
                return sum + Number(f.amount);
            }
            return sum;
        }, 0);
    };

    const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const pendingTotal = sumPending(selectedMonth, selectedYear) + sumPending(prevMonth, prevYear);
    
    const projectedBillTotal = currentBillTotal + pendingTotal; // Valor Final Estimado

    extractList.sort((a, b) => a.date.getTime() - b.date.getTime());

    // 3. COMPROMETIDO (LIMITE)
    const allExpenses = state.expenses.filter(e => e.paymentMethod === card.name);
    const generatedIds = Array.from(paymentMap.keys());
    
    const committedTotal = allExpenses
        .filter(e => !generatedIds.includes(e.id))
        .reduce((sum, e) => sum + Number(e.amount), 0)
        +
        state.fixedExpenses
        .filter(f => f.creditCardId === card.id)
        .reduce((sum, f) => sum + Number(f.amount), 0);

    return { 
        currentBillTotal, 
        projectedBillTotal, 
        pendingTotal, // Valor só da previsão
        committedTotal, 
        availableLimit: card.limit - committedTotal, 
        extractList 
    };
  };

  // --- CÁLCULO GERAL (CONJUGADO) ---
  const globalMetrics = useMemo(() => {
    return state.creditCards.reduce((acc, card) => {
        const metrics = calculateCardMetrics(card);
        return {
            limit: acc.limit + card.limit,
            committed: acc.committed + metrics.committedTotal,
            currentTotal: acc.currentTotal + metrics.currentBillTotal,
            projectedTotal: acc.projectedTotal + metrics.projectedBillTotal
        };
    }, { limit: 0, committed: 0, currentTotal: 0, projectedTotal: 0 });
  }, [state.expenses, state.fixedExpenses, state.creditCards, selectedMonth, selectedYear]);

  const globalAvailable = globalMetrics.limit - globalMetrics.committed;
  const globalUtilization = globalMetrics.limit > 0 ? (globalMetrics.committed / globalMetrics.limit) * 100 : 0;


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

  const handlePayment = async (cardId: string, amount: number, userId: string) => {
    try {
        await payCreditCardBill(cardId, selectedMonth, selectedYear, amount, userId);
        toast({ title: 'Pagamento registrado com sucesso!' });
    } catch (error: any) {
        toast({ title: 'Erro ao pagar', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Cartões de Crédito</h1>
            <p className="text-sm text-muted-foreground">Gestão de limites e faturas</p>
          </div>
          {!showForm && (
             <Button onClick={() => setShowForm(true)} className="bg-gradient-primary">
               <Plus className="w-5 h-5 mr-1" /> <span className="hidden sm:inline">Novo Cartão</span>
             </Button>
          )}
        </div>
      </div>

      {/* --- BLOCO DE RESUMO GERAL (CONJUGADO) --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* 1. Limite Conjugado */}
        <Card className="shadow-card border-l-4 border-l-blue-600 md:col-span-2">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-blue-600" /> Limite Conjugado
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <span className="text-2xl font-bold">{formatCurrency(globalMetrics.committed)}</span>
                        <span className="text-xs text-muted-foreground ml-2">usados de {formatCurrency(globalMetrics.limit)}</span>
                    </div>
                    <div className="text-right">
                        <span className="text-xs font-bold text-green-600 uppercase">Disponível</span>
                        <div className="text-lg font-bold text-green-700">{formatCurrency(globalAvailable)}</div>
                    </div>
                </div>
                <div className="w-full bg-secondary h-3 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-500 ${globalUtilization > 90 ? 'bg-red-500' : globalUtilization > 70 ? 'bg-orange-500' : 'bg-blue-600'}`} 
                        style={{ width: `${Math.min(globalUtilization, 100)}%` }} 
                    />
                </div>
            </CardContent>
        </Card>

        {/* 2. Total Previsto (Soma das Faturas) */}
        <Card className="shadow-card border-l-4 border-l-purple-600">
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-600" /> Faturas do Mês
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-purple-700">{formatCurrency(globalMetrics.currentTotal)}</div>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <span>Previsão Final:</span>
                    <span className="font-bold text-foreground">{formatCurrency(globalMetrics.projectedTotal)}</span>
                </div>
            </CardContent>
        </Card>

      </div>

      {/* Form */}
      {showForm && (
         <Card className="mb-4 shadow-card animate-in slide-in-from-top-4 border-primary/20">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Novo Cartão</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} className="h-8 w-8"><X className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent className="p-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nome do Cartão</Label>
                            <Input placeholder="Ex: Nubank..." value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required className="h-11" />
                        </div>
                        <div className="space-y-2">
                            <Label>Limite Total</Label>
                            <Input type="number" step="0.01" placeholder="0,00" value={formData.limit} onChange={(e) => setFormData({ ...formData, limit: e.target.value })} required className="h-11" />
                        </div>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Dia Fechamento</Label>
                            <Input type="number" placeholder="Dia" value={formData.closingDay} onChange={(e) => setFormData({ ...formData, closingDay: e.target.value })} required className="h-11 text-center" />
                        </div>
                        <div className="space-y-2">
                            <Label>Dia Vencimento</Label>
                            <Input type="number" placeholder="Dia" value={formData.dueDay} onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })} required className="h-11 text-center" />
                        </div>
                     </div>
                     <Button type="submit" disabled={loading} className="w-full h-11 bg-gradient-primary">
                        {loading ? 'Salvando...' : 'Cadastrar Cartão'}
                     </Button>
                </form>
            </CardContent>
         </Card>
      )}

      {/* Lista de Cartões Individuais */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {state.creditCards.map((card) => {
          const { currentBillTotal, projectedBillTotal, pendingTotal, committedTotal, availableLimit, extractList } = calculateCardMetrics(card);
          const utilizationPercentage = card.limit > 0 ? (committedTotal / card.limit) * 100 : 0;
          const paymentRecord = state.creditCardPayments?.find(p => p.cardId === card.id && p.month === selectedMonth && p.year === selectedYear);
          const isBillPaid = !!paymentRecord;
          const isExpanded = expandedCardId === card.id;

          return (
            <Card key={card.id} className={`shadow-card transition-all ${isBillPaid ? 'opacity-90 border-green-200 bg-green-50/10' : ''}`}>
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                     <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CardIcon className="w-5 h-5 text-primary" />
                     </div>
                     <div>
                        <CardTitle>{card.name}</CardTitle>
                        <CardDescription>Limite: {formatCurrency(card.limit)}</CardDescription>
                     </div>
                  </div>
                  <Badge variant={isBillPaid ? 'default' : 'outline'} className={isBillPaid ? 'bg-green-600' : ''}>
                    {isBillPaid ? 'Paga' : 'Aberta'}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="p-4 space-y-4">
                
                {/* Visualização de Progresso Individual */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                     <span className="text-muted-foreground">Utilizado</span>
                     <span className="font-bold">{formatCurrency(committedTotal)}</span>
                  </div>
                  <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                     <div className="bg-primary h-full transition-all duration-500" style={{ width: `${Math.min(utilizationPercentage, 100)}%` }} />
                  </div>
                  <div className="text-right text-xs text-green-600 font-medium">Disp: {formatCurrency(availableLimit)}</div>
                </div>

                {/* Info Fatura (SEPARADO: ATUAL x PREVISTO) */}
                <div className="bg-card border rounded-lg p-3 shadow-sm space-y-2">
                   <div className="flex justify-between items-end border-b pb-2">
                      <div>
                          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Fatura Atual</p>
                          <p className="text-xl font-bold">{formatCurrency(currentBillTotal)}</p>
                      </div>
                      <div className="text-right">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Previsão</p>
                          <p className="text-sm font-bold text-muted-foreground">{formatCurrency(projectedBillTotal)}</p>
                      </div>
                   </div>
                   
                   {/* Se tiver previsão pendente, mostra aviso */}
                   {pendingTotal > 0 && (
                       <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 p-1.5 rounded">
                           <AlertCircle className="w-3 h-3" />
                           <span>+{formatCurrency(pendingTotal)} em contas fixas pendentes</span>
                       </div>
                   )}

                   <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
                      <span>Fecha dia {card.closingDay}</span>
                      <span>Vence dia {card.dueDay}</span>
                   </div>
                </div>

                {/* Botão Extrato */}
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setExpandedCardId(isExpanded ? null : card.id)}
                    className="w-full h-8 text-xs flex justify-between items-center bg-muted/50 hover:bg-muted"
                >
                    <span className="flex items-center"><FileText className="w-3 h-3 mr-2" /> Ver Detalhes</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </Button>

                {/* LISTA DE EXTRATO EXPANDIDA */}
                {isExpanded && (
                    <div className="border rounded-md overflow-hidden animate-in slide-in-from-top-2">
                        <div className="bg-muted p-2 text-[10px] font-bold flex justify-between uppercase tracking-wider text-muted-foreground">
                            <span>Lançamento</span>
                            <span>Valor</span>
                        </div>
                        <div className="max-h-[250px] overflow-y-auto bg-background/50">
                            {extractList.length === 0 ? (
                                <p className="p-4 text-center text-xs text-muted-foreground">Nenhum item nesta fatura.</p>
                            ) : (
                                extractList.map((item, idx) => (
                                    <div key={idx} className={`flex justify-between items-center p-2 border-b last:border-0 text-xs transition-colors ${item.isProjected ? 'bg-orange-50/50 hover:bg-orange-50' : 'hover:bg-muted/20'}`}>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-medium truncate max-w-[150px]" title={item.name}>{item.name}</span>
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                {format(item.date, 'dd/MM')} • 
                                                <span className={item.isProjected ? 'text-orange-600 font-bold' : (item.type.includes('Fixo') ? 'text-blue-600' : '')}>
                                                    {item.type}
                                                </span>
                                            </span>
                                        </div>
                                        <span className={`font-bold whitespace-nowrap ${item.isProjected ? 'text-orange-600' : ''}`}>
                                            {formatCurrency(item.amount)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Ações de Pagamento */}
                {!isBillPaid ? (
                    <Select onValueChange={(uid) => handlePayment(card.id, currentBillTotal, uid)}>
                      <SelectTrigger className="w-full border-primary/20 hover:border-primary/50"><SelectValue placeholder="Pagar Fatura Atual" /></SelectTrigger>
                      <SelectContent>
                         <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Quem pagou?</div>
                         {state.users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                ) : (
                    <div className="bg-green-100 border border-green-200 text-green-700 p-2 rounded-md text-center text-sm font-bold flex items-center justify-center">
                        <Check className="w-4 h-4 mr-2" /> Fatura Paga
                    </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}