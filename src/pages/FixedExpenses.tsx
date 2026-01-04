import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
// IMPORTANTE: Certifique-se de que os componentes do Dialog estão instalados no seu projeto
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ExpenseCategory, FixedExpense } from '@/types';
import { Plus, Calendar, Check, X, CreditCard, AlertCircle } from 'lucide-react';

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: 'moradia', label: 'Moradia' },
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
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

  // --- ESTADOS DO MODAL DE CONFIRMAÇÃO ---
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedExpenseToPay, setSelectedExpenseToPay] = useState<FixedExpense | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const { month: selectedMonth, year: selectedYear } = state.selectedMonth;
  const currentExpenses = getActiveFixedExpenses(selectedMonth, selectedYear);

  // --- CÁLCULOS DE RESUMO ---
  // Se tiver paidAmount (valor real pago), usa ele. Se não, usa o amount (valor previsto).
  const totalExpected = currentExpenses.reduce((acc, e) => acc + (e.isPaid && e.paidAmount ? e.paidAmount : e.amount), 0);
  const totalPaid = currentExpenses.filter(e => e.isPaid).reduce((acc, e) => acc + (e.paidAmount || e.amount), 0);
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
    const effectiveDate = new Date(selectedYear, selectedMonth, 1);

    await addFixedExpense({
      name: formData.name,
      category: formData.category,
      amount: parseFloat(formData.amount),
      dueDay: parseInt(formData.dueDay),
      isPaid: false,
      effectiveFrom: effectiveDate, 
      creditCardId: formData.creditCardId === 'none' ? null : formData.creditCardId
    });
    setLoading(false);

    toast({ title: 'Sucesso!', description: 'Gasto fixo cadastrado.' });
    setFormData({ name: '', category: '' as ExpenseCategory, amount: '', dueDay: '', creditCardId: 'none' });
    setShowForm(false);
  };

  // --- AÇÃO 1: CLICAR NO BOTÃO "PAGAR" NA LISTA ---
  const handleClickPay = (expense: FixedExpense) => {
    if (expense.isPaid) {
      // Se já está pago, executa o estorno direto (manda 0 pois será deletado)
      handleTogglePayment(expense.id, 0); 
    } else {
      // Se vai pagar, ABRE O MODAL
      setSelectedExpenseToPay(expense);
      setPaymentAmount(expense.amount.toString()); // Preenche com o valor padrão
      setPaymentModalOpen(true);
    }
  };

  // --- AÇÃO 2: CONFIRMAR NO MODAL ---
  const confirmPayment = async () => {
    if (!selectedExpenseToPay) return;
    
    // Validação do valor
    const val = parseFloat(paymentAmount);
    if (!val || val <= 0) {
        toast({ title: "Valor inválido", description: "O valor deve ser maior que zero.", variant: "destructive" });
        return;
    }

    // Fecha modal e executa pagamento
    await handleTogglePayment(selectedExpenseToPay.id, val);
    setPaymentModalOpen(false);
    setSelectedExpenseToPay(null);
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
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20">
      
      {/* HEADER E AÇÕES */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Gastos Fixos</h1>
            <p className="text-sm text-muted-foreground">Contas recorrentes (Aluguel, Internet...)</p>
          </div>
          
          <div className="flex w-full md:w-auto gap-2">
             {!showForm && (
               <Button onClick={() => setShowForm(true)} className="bg-gradient-primary w-full md:w-auto h-11 md:h-10 text-base">
                 <Plus className="w-5 h-5 mr-2" /> Nova Conta
               </Button>
             )}
          </div>
        </div>
      </div>

      {/* CARDS DE RESUMO */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
         <Card className="shadow-card border-l-4 border-l-blue-500 bg-blue-50/20 col-span-2 md:col-span-1">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-xs md:text-sm font-medium text-blue-700">Total Previsto</p>
                    <p className="text-xl md:text-2xl font-bold text-blue-600">{formatCurrency(totalExpected)}</p>
                </div>
                <Calendar className="w-6 h-6 text-blue-300 md:w-8 md:h-8" />
            </CardContent>
         </Card>
         <Card className="shadow-card border-l-4 border-l-green-500 bg-green-50/20">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-xs md:text-sm font-medium text-green-700">Pago</p>
                    <p className="text-lg md:text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                </div>
                <Check className="w-5 h-5 text-green-300 md:w-8 md:h-8" />
            </CardContent>
         </Card>
         <Card className="shadow-card border-l-4 border-l-red-500 bg-red-50/20">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-xs md:text-sm font-medium text-red-700">Falta Pagar</p>
                    <p className="text-lg md:text-2xl font-bold text-red-600">{formatCurrency(totalPending)}</p>
                </div>
                <AlertCircle className="w-5 h-5 text-red-300 md:w-8 md:h-8" />
            </CardContent>
         </Card>
      </div>

      {/* FORMULÁRIO */}
      {showForm && (
        <Card className="shadow-card animate-in slide-in-from-top-4 border-primary/20">
          <CardHeader className="p-4 pb-2">
            <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Nova Conta Fixa</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label>Nome da Conta</Label>
                    <Input 
                        placeholder="Ex: Netflix, Aluguel" 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        required 
                        className="h-11" 
                    />
                 </div>
                 <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={formData.category} onValueChange={v => setFormData({...formData, category: v as ExpenseCategory})}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                           {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                 </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="0,00" 
                        value={formData.amount} 
                        onChange={e => setFormData({...formData, amount: e.target.value})} 
                        required 
                        className="h-11 font-bold" 
                    />
                 </div>
                 <div className="space-y-2">
                    <Label>Dia Vencimento</Label>
                    <Input 
                        type="number" 
                        min="1" 
                        max="31" 
                        placeholder="Dia" 
                        value={formData.dueDay} 
                        onChange={e => setFormData({...formData, dueDay: e.target.value})} 
                        required 
                        className="h-11 text-center" 
                    />
                 </div>
              </div>

              <div className="space-y-2 bg-muted/30 p-3 rounded-lg border border-dashed">
                 <Label className="flex items-center gap-2 text-sm font-medium">
                    <CreditCard className="w-4 h-4" /> Vincular Cartão (Opcional)
                 </Label>
                 <Select value={formData.creditCardId} onValueChange={v => setFormData({...formData, creditCardId: v})}>
                    <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Forma de Pagamento" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">💵 Pagar via Conta/Pix</SelectItem>
                        {state.creditCards.map(card => (
                            <SelectItem key={card.id} value={card.id}>💳 {card.name}</SelectItem>
                        ))}
                    </SelectContent>
                 </Select>
                 <p className="text-[10px] text-muted-foreground mt-1 px-1">
                    O valor será lançado automaticamente na fatura do cartão escolhido.
                 </p>
              </div>

              <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-primary text-base">
                  {loading ? 'Salvando...' : 'Cadastrar Conta Fixa'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* LISTA DE CONTAS */}
      <div className="grid gap-3 md:gap-4">
        {currentExpenses.length === 0 ? (
             <div className="text-center py-10 border rounded-lg bg-muted/10 border-dashed">
                 <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                 <p className="text-muted-foreground">Nenhuma conta fixa para este mês.</p>
             </div>
        ) : (
            currentExpenses.map((expense) => {
                const cardName = getCardName(expense.creditCardId);
                // Define qual valor mostrar (o pago se existir, ou o padrão)
                const displayAmount = expense.isPaid && expense.paidAmount ? expense.paidAmount : expense.amount;
                // Define se o valor mudou para dar destaque visual
                const isAmountChanged = expense.isPaid && expense.paidAmount && expense.paidAmount !== expense.amount;

                return (
                    <Card key={expense.id} className={`shadow-sm transition-all border ${expense.isPaid ? 'bg-muted/30 opacity-80' : 'bg-card border-l-4 border-l-primary'}`}>
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
                             
                             {/* Informações da Conta */}
                             <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between md:justify-start gap-2">
                                   <h3 className="text-base md:text-lg font-semibold truncate">{expense.name}</h3>
                                   <Badge variant={expense.isPaid ? "default" : "secondary"} className={expense.isPaid ? "bg-green-600" : ""}>
                                      {expense.isPaid ? "Pago" : "Pendente"}
                                   </Badge>
                                </div>
                                
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                   <div className="flex items-center gap-2">
                                     <span className={`font-bold text-base ${isAmountChanged ? 'text-blue-600' : 'text-foreground'}`}>
                                        {formatCurrency(displayAmount)}
                                     </span>
                                     {isAmountChanged && (
                                       <span className="text-xs line-through text-muted-foreground">
                                          {formatCurrency(expense.amount)}
                                       </span>
                                     )}
                                   </div>
                                   
                                   <span className="flex items-center gap-1 text-xs md:text-sm">
                                      <Calendar className="w-3 h-3" /> Vence dia {expense.dueDay}
                                   </span>
                                   {cardName && (
                                      <span className="flex items-center gap-1 text-xs text-purple-600 font-medium bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                                            <CreditCard className="w-3 h-3" /> {cardName}
                                      </span>
                                   )}
                                </div>
                             </div>
        
                             {/* Botão de Ação - CHAMA O HANDLER QUE ABRE O MODAL */}
                             <div className="w-full md:w-auto mt-2 md:mt-0">
                                <Button 
                                   variant={expense.isPaid ? "outline" : "default"}
                                   size="sm"
                                   onClick={() => handleClickPay(expense)}
                                   className={`w-full md:w-auto h-10 ${expense.isPaid ? 'border-red-200 text-red-600 hover:bg-red-50' : 'bg-gradient-primary'}`}
                                >
                                   {expense.isPaid ? (
                                      <><X className="w-4 h-4 mr-2" /> Desmarcar</>
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

      {/* --- O MODAL PARA VALIDAR O VALOR ESTÁ AQUI --- */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
            <DialogDescription>
              O valor da conta veio diferente? Ajuste abaixo antes de confirmar.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pay-amount" className="text-right">
                Valor
              </Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0.01"
                autoFocus
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="col-span-3 font-bold text-lg"
              />
            </div>
            {selectedExpenseToPay && (
                <div className="text-xs text-muted-foreground text-center bg-muted/50 p-2 rounded">
                    Conta: <span className="font-medium text-foreground">{selectedExpenseToPay.name}</span> • Vencimento: dia {selectedExpenseToPay.dueDay}
                </div>
            )}
          </div>

          <DialogFooter className="flex flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmPayment} className="bg-green-600 hover:bg-green-700 text-white">
              <Check className="w-4 h-4 mr-2"/> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}