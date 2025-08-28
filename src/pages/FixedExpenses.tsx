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
  { value: 'lazer', label: 'Lazer' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'moradia', label: 'Moradia' },
  { value: 'vestuario', label: 'Vestuário' },
  { value: 'outros', label: 'Outros' }
];

export default function FixedExpenses() {
  const { state, dispatch } = useFinance();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    category: '' as ExpenseCategory,
    amount: '',
    dueDay: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.category || !formData.amount || !formData.dueDay) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    const newFixedExpense = {
      id: Date.now().toString(),
      name: formData.name,
      category: formData.category,
      amount: parseFloat(formData.amount),
      dueDay: parseInt(formData.dueDay),
      isPaid: false,
      createdAt: new Date()
    };

    dispatch({ type: 'ADD_FIXED_EXPENSE', payload: newFixedExpense });

    toast({
      title: 'Sucesso!',
      description: 'Gasto fixo cadastrado com sucesso'
    });

    setFormData({ name: '', category: '' as ExpenseCategory, amount: '', dueDay: '' });
    setShowForm(false);
  };

  const handlePayment = (expenseId: string, userId: string) => {
    dispatch({
      type: 'UPDATE_FIXED_EXPENSE',
      payload: {
        id: expenseId,
        updates: {
          isPaid: true,
          paidBy: userId,
          paidAt: new Date()
        }
      }
    });

    toast({
      title: 'Pagamento registrado!',
      description: 'Gasto fixo marcado como pago'
    });
  };

  const handleUnpay = (expenseId: string) => {
    dispatch({
      type: 'UPDATE_FIXED_EXPENSE',
      payload: {
        id: expenseId,
        updates: {
          isPaid: false,
          paidBy: undefined,
          paidAt: undefined
        }
      }
    });

    toast({
      title: 'Pagamento removido',
      description: 'Gasto fixo marcado como pendente'
    });
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
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gastos Fixos</h1>
          <p className="text-muted-foreground">
            Gerencie gastos recorrentes que se repetem mensalmente
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" />
          Novo Gasto Fixo
        </Button>
      </div>

      {/* Formulário */}
      {showForm && (
        <Card className="shadow-card animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Plus className="w-5 h-5 text-primary" />
              <span>Cadastrar Gasto Fixo</span>
            </CardTitle>
            <CardDescription>
              Gastos fixos são replicados automaticamente todos os meses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Gasto *</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Aluguel, Internet, Energia"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <div className="space-y-2">
                  <Label htmlFor="dueDay">Dia de Vencimento *</Label>
                  <Input
                    id="dueDay"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Ex: 10"
                    value={formData.dueDay}
                    onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })}
                    required
                  />
                </div>
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

      {/* Lista de Gastos Fixos */}
      <div className="grid gap-4">
        {state.fixedExpenses.length === 0 ? (
          <Card className="p-8 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Nenhum gasto fixo cadastrado
            </h3>
            <p className="text-muted-foreground mb-4">
              Cadastre seus gastos recorrentes para melhor controle financeiro
            </p>
            <Button onClick={() => setShowForm(true)} className="bg-gradient-primary hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Cadastrar Primeiro Gasto Fixo
            </Button>
          </Card>
        ) : (
          state.fixedExpenses.map((expense) => (
            <Card key={expense.id} className="shadow-card hover-scale">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-foreground">
                        {expense.name}
                      </h3>
                      <Badge variant="outline">
                        {getCategoryLabel(expense.category)}
                      </Badge>
                      <Badge 
                        variant={expense.isPaid ? "default" : "secondary"}
                        className={expense.isPaid ? "bg-green-500 hover:bg-green-600" : ""}
                      >
                        {expense.isPaid ? (
                          <>
                            <Check className="w-3 h-3 mr-1" />
                            Pago
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3 mr-1" />
                            Pendente
                          </>
                        )}
                      </Badge>
                    </div>

                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <DollarSign className="w-4 h-4" />
                        <span className="font-medium text-foreground">
                          {formatCurrency(expense.amount)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>Vence dia {expense.dueDay}</span>
                      </div>
                      {expense.isPaid && expense.paidBy && (
                        <div>
                          Pago por: <span className="font-medium">
                            {getUserName(expense.paidBy)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {expense.isPaid ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnpay(expense.id)}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Desfazer Pagamento
                      </Button>
                    ) : (
                      <div className="flex space-x-2">
                        {state.users.map((user) => (
                          <Button
                            key={user.id}
                            variant="outline"
                            size="sm"
                            onClick={() => handlePayment(expense.id, user.id)}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Pagar ({user.name})
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}