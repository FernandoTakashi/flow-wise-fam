import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ExpenseCategory } from '@/types';
import { Plus, Calendar, DollarSign, Check, X, CreditCard, AlertCircle } from 'lucide-react';
import MonthSelector from '@/components/MonthSelector';

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'lazer', label: 'Lazer' },
  { value: 'outros', label: 'Outros' },
];

export default function FixedExpenses() {
  const { 
    state, 
    addFixedExpense, 
    toggleFixedExpensePayment, 
    getActiveFixedExpenses 
  } = useFinance();
  
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const { month: selectedMonth, year: selectedYear } = state.selectedMonth;
  const currentExpenses = getActiveFixedExpenses(selectedMonth, selectedYear);

  // --- CÁLCULOS DE RESUMO ---
  const totalExpected = currentExpenses.reduce((acc, e) => acc + e.amount, 0);
  const totalPaid = currentExpenses.filter(e => e.isPaid).reduce((acc, e) => acc + e.amount, 0);
  const totalPending = totalExpected - totalPaid;

  const [formData, setFormData] = useState({
    name: '',
    category: '' as ExpenseCategory,
    amount: '',
    dueDay: '',
    creditCardId: 'none'
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.category || !formData.amount || !formData.dueDay) {
        toast({ title: 'Erro', description: 'Preencha os campos obrigatórios', variant: 'destructive' });
        return;
    }

    setLoading(true);
    await addFixedExpense({
      name: formData.name,
      category: formData.category,
      amount: parseFloat(formData.amount),
      dueDay: parseInt(formData.dueDay),
      isPaid: false, // <--- CORREÇÃO AQUI: Propriedade obrigatória adicionada
      effectiveFrom: new Date(),
      creditCardId: formData.creditCardId === 'none' ? null : formData.creditCardId
    });
    setLoading(false);

    toast({ title: 'Sucesso!', description: 'Gasto fixo cadastrado.' });
    setFormData({ name: '', category: '' as ExpenseCategory, amount: '', dueDay: '', creditCardId: 'none' });
    setShowForm(false);
  };

  const handleTogglePayment = async (expenseId: string, amount: number) => {
    try {
        await toggleFixedExpensePayment(expenseId, selectedMonth, selectedYear, amount);
    } catch (error) {
        toast({ title: "Erro", variant: "destructive" });
    }
  };

  const getCardName = (cardId?: string | null) => {
      if (!cardId) return null;
      return state.creditCards.find(c => c.id === cardId)?.name;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gastos Fixos</h1>
          <p className="text-muted-foreground">Contas recorrentes (Aluguel, Internet, Assinaturas)</p>
        </div>
        
        <div className="flex gap-2">
            <MonthSelector />
            <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
                <Plus className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Novo Gasto</span>
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <Card className="shadow-card border-l-4 border-l-blue-500">
            <CardContent className="p-4">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm font-medium text-blue-700">Total Previsto</p>
                        <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalExpected)}</p>
                    </div>
                    <Calendar className="w-8 h-8 text-blue-200" />
                </div>
            </CardContent>
         </Card>
         <Card className="shadow-card border-l-4 border-l-green-500">
            <CardContent className="p-4">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm font-medium text-green-700">Já Pago</p>
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                    </div>
                    <Check className="w-8 h-8 text-green-200" />
                </div>
            </CardContent>
         </Card>
         <Card className="shadow-card border-l-4 border-l-red-500">
            <CardContent className="p-4">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm font-medium text-red-700">Falta Pagar</p>
                        <p className="text-2xl font-bold text-red-600">{formatCurrency(totalPending)}</p>
                    </div>
                    <AlertCircle className="w-8 h-8 text-red-200" />
                </div>
            </CardContent>
         </Card>
      </div>

      {showForm && (
        <Card className="shadow-card animate-scale-in">
          <CardHeader><CardTitle>Cadastrar Gasto Fixo</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input placeholder="Ex: Netflix, Aluguel" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                 </div>
                 <div className="space-y-2">
                    <Label>Categoria *</Label>
                    <Select onValueChange={v => setFormData({...formData, category: v as ExpenseCategory})}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                           {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                 </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label>Valor *</Label>
                    <Input type="number" step="0.01" placeholder="0,00" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required />
                 </div>
                 <div className="space-y-2">
                    <Label>Dia Vencimento *</Label>
                    <Input type="number" min="1" max="31" placeholder="Dia" value={formData.dueDay} onChange={e => setFormData({...formData, dueDay: e.target.value})} required />
                 </div>
              </div>

              <div className="space-y-2 bg-muted/30 p-3 rounded-lg border border-dashed">
                 <Label className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Vincular a Cartão de Crédito (Opcional)
                 </Label>
                 <Select value={formData.creditCardId} onValueChange={v => setFormData({...formData, creditCardId: v})}>
                    <SelectTrigger><SelectValue placeholder="Forma de Pagamento" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">💵 Não vincular (Pagar via Conta/Pix)</SelectItem>
                        {state.creditCards.map(card => (
                            <SelectItem key={card.id} value={card.id}>💳 {card.name}</SelectItem>
                        ))}
                    </SelectContent>
                 </Select>
                 <p className="text-xs text-muted-foreground">
                    Se vinculado, o valor será somado à fatura do cartão e não sairá do saldo imediatamente.
                 </p>
              </div>

              <div className="flex gap-4 pt-2">
                  <Button type="submit" disabled={loading} className="flex-1 bg-gradient-primary">
                     {loading ? 'Salvando...' : 'Cadastrar'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {currentExpenses.length === 0 ? (
             <div className="text-center py-8 text-muted-foreground">
                 <p>Nenhum gasto fixo ativo para este mês.</p>
             </div>
        ) : (
            currentExpenses.map((expense) => {
                const cardName = getCardName(expense.creditCardId);
                return (
                    <Card key={expense.id} className="shadow-card hover:shadow-card-hover transition-all">
                       <CardContent className="p-6">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                             
                             <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                   <h3 className="text-lg font-semibold">{expense.name}</h3>
                                   <Badge variant={expense.isPaid ? "default" : "secondary"}>
                                      {expense.isPaid ? "Pago" : "Pendente"}
                                   </Badge>
                                </div>
                                
                                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                   <span className="flex items-center gap-1">
                                      <DollarSign className="w-4 h-4" /> {formatCurrency(expense.amount)}
                                   </span>
                                   <span className="flex items-center gap-1">
                                      <Calendar className="w-4 h-4" /> Dia {expense.dueDay}
                                   </span>
                                   {cardName && (
                                       <Badge variant="outline" className="flex items-center gap-1 bg-purple-50 text-purple-700 border-purple-200">
                                           <CreditCard className="w-3 h-3" /> Fatura {cardName}
                                       </Badge>
                                   )}
                                </div>
                             </div>
        
                             <div>
                                <Button 
                                   variant={expense.isPaid ? "outline" : "default"}
                                   size="sm"
                                   onClick={() => handleTogglePayment(expense.id, expense.amount)}
                                   className={!expense.isPaid ? "w-full md:w-auto" : "w-full md:w-auto border-red-200 text-red-600 hover:bg-red-50"}
                                >
                                   {expense.isPaid ? (
                                      <><X className="w-4 h-4 mr-2" /> Estornar</>
                                   ) : (
                                      <><Check className="w-4 h-4 mr-2" /> Pagar</>
                                   )}
                                </Button>
                             </div>
                          </div>
                       </CardContent>
                    </Card>
                );
            })
        )}
      </div>
    </div>
  );
}