import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ExpenseCategory } from '@/types';
import { Plus, Calendar, DollarSign, Check, X, Clock } from 'lucide-react';

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' },
  { value: 'outros', label: 'Outros' },
  // ... adicione as outras se quiser
];

export default function FixedExpenses() {
  // Pegamos as funções novas do contexto
  const { state, addFixedExpense, updateFixedExpense } = useFinance();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    category: '' as ExpenseCategory,
    amount: '',
    dueDay: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.category || !formData.amount || !formData.dueDay) return;

    setLoading(true);
    await addFixedExpense({
      name: formData.name,
      category: formData.category,
      amount: parseFloat(formData.amount),
      dueDay: parseInt(formData.dueDay),
      isPaid: false,
      effectiveFrom: new Date()
    });
    setLoading(false);

    setFormData({ name: '', category: '' as ExpenseCategory, amount: '', dueDay: '' });
    setShowForm(false);
  };

  const handlePayment = async (expenseId: string, userId: string) => {
    await updateFixedExpense(expenseId, {
      isPaid: true,
      paidBy: userId,
      paidAt: new Date()
    });
    toast({ title: 'Pagamento registrado!' });
  };

  const handleUnpay = async (expenseId: string) => {
    await updateFixedExpense(expenseId, {
      isPaid: false,
      paidBy: undefined,
      paidAt: undefined
    });
    toast({ title: 'Pagamento removido' });
  };

  const getCategoryLabel = (category: ExpenseCategory) => {
    return categories.find(cat => cat.value === category)?.label || category;
  };

  const getUserName = (userId: string) => {
    return state.users.find(user => user.id === userId)?.name || 'Usuário';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gastos Fixos</h1>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary">
          <Plus className="w-4 h-4 mr-2" /> Novo Gasto Fixo
        </Button>
      </div>

      {showForm && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Cadastrar Gasto Fixo</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Campos do formulário (iguais ao seu código original) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 <div className="space-y-2">
                    <Label>Categoria</Label>
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
                    <Label>Valor</Label>
                    <Input type="number" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
                 </div>
                 <div className="space-y-2">
                    <Label>Dia Vencimento</Label>
                    <Input type="number" max="31" value={formData.dueDay} onChange={e => setFormData({...formData, dueDay: e.target.value})} />
                 </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-gradient-primary">
                 {loading ? 'Salvando...' : 'Cadastrar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {state.fixedExpenses.map((expense) => (
            <Card key={expense.id} className="shadow-card">
               <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                     <div>
                        <h3 className="text-lg font-semibold">{expense.name}</h3>
                        <div className="text-sm text-muted-foreground">
                           {formatCurrency(expense.amount)} - Vence dia {expense.dueDay}
                        </div>
                     </div>
                     <div>
                        {expense.isPaid ? (
                           <Button variant="outline" size="sm" onClick={() => handleUnpay(expense.id)}>
                              <X className="w-4 h-4 mr-2" /> Desfazer
                           </Button>
                        ) : (
                           <div className="flex space-x-2">
                              {state.users.map(user => (
                                 <Button key={user.id} variant="outline" size="sm" onClick={() => handlePayment(expense.id, user.id)}>
                                    <Check className="w-4 h-4 mr-1" /> {user.name}
                                 </Button>
                              ))}
                           </div>
                        )}
                     </div>
                  </div>
               </CardContent>
            </Card>
        ))}
      </div>
    </div>
  );
}