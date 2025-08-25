import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ExpenseCategory, ExpenseType, PaymentMethod } from '@/types';
import { ArrowLeft, Plus } from 'lucide-react';

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

const expenseTypes: { value: ExpenseType; label: string }[] = [
  { value: 'fixo', label: 'Fixo' },
  { value: 'variavel', label: 'Variável' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' }
];

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Débito' },
  { value: 'pix', label: 'PIX' }
];

export default function NewExpense() {
  const navigate = useNavigate();
  const { state, dispatch } = useFinance();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '' as ExpenseCategory,
    type: '' as ExpenseType,
    paymentMethod: '' as PaymentMethod,
    description: '',
    amount: '',
    userId: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.category || !formData.type || !formData.paymentMethod || !formData.userId || !formData.amount) {
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
      type: formData.type,
      paymentMethod: formData.paymentMethod,
      description: formData.description,
      amount: parseFloat(formData.amount),
      userId: formData.userId,
      createdAt: new Date()
    };

    dispatch({ type: 'ADD_EXPENSE', payload: newExpense });

    toast({
      title: 'Sucesso!',
      description: 'Gasto cadastrado com sucesso',
    });

    navigate('/');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Cadastrar Novo Gasto</h1>
          <p className="text-muted-foreground">Registre um novo gasto no sistema</p>
        </div>
      </div>

      <Card className="max-w-2xl mx-auto shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-primary" />
            <span>Informações do Gasto</span>
          </CardTitle>
          <CardDescription>Preencha as informações do novo gasto</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                <Label>Tipo de Gasto *</Label>
                <Select onValueChange={(value) => setFormData({ ...formData, type: value as ExpenseType })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Forma de Pagamento *</Label>
                <Select onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as PaymentMethod })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Como foi pago" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                    {state.creditCards.map((card) => (
                      <SelectItem key={card.id} value={card.name}>
                        {card.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descrição do gasto (opcional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex space-x-4 pt-4">
              <Button type="submit" className="bg-gradient-primary hover:opacity-90 flex-1">
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Gasto
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}