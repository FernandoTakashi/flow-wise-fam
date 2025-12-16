import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Calendar, DollarSign, Check, X, Clock, TrendingUp } from 'lucide-react';

export default function FixedIncomes() {
  const { state, addFixedIncome, updateFixedIncome } = useFinance();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    receiveDay: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || !formData.receiveDay) {
      toast({ title: 'Erro', description: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    setLoading(true);
    await addFixedIncome({
      description: formData.description,
      amount: parseFloat(formData.amount),
      receiveDay: parseInt(formData.receiveDay),
      isReceived: false,
      effectiveFrom: new Date()
    });
    setLoading(false);

    toast({ title: 'Sucesso!', description: 'Entrada fixa cadastrada com sucesso' });
    setFormData({ description: '', amount: '', receiveDay: '' });
    setShowForm(false);
  };

  const handleReceive = async (incomeId: string, userId: string) => {
    await updateFixedIncome(incomeId, {
      isReceived: true,
      receivedBy: userId,
      receivedAt: new Date()
    });
    toast({ title: 'Recebimento registrado!', description: 'Valor marcado como recebido' });
  };

  const handleUnreceive = async (incomeId: string) => {
    await updateFixedIncome(incomeId, {
      isReceived: false,
      receivedBy: undefined,
      receivedAt: undefined
    });
    toast({ title: 'Ação desfeita', description: 'Marcado como pendente' });
  };

  const getUserName = (userId: string) => {
    return state.users.find(user => user.id === userId)?.name || 'Usuário';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Entradas Fixas</h1>
          <p className="text-muted-foreground">
            Gerencie salários, aluguéis e outras receitas recorrentes
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" />
          Nova Entrada Fixa
        </Button>
      </div>

      {showForm && (
        <Card className="shadow-card animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Plus className="w-5 h-5 text-primary" />
              <span>Cadastrar Entrada Fixa</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição *</Label>
                  <Input 
                    id="description" 
                    placeholder="Ex: Salário Mensal, Aluguel Kitnet" 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
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

              <div className="space-y-2">
                <Label htmlFor="receiveDay">Dia de Recebimento *</Label>
                <Input 
                  id="receiveDay" 
                  type="number" 
                  min="1" 
                  max="31" 
                  placeholder="Ex: 05" 
                  value={formData.receiveDay} 
                  onChange={(e) => setFormData({ ...formData, receiveDay: e.target.value })} 
                  required 
                />
              </div>

              <div className="flex space-x-4 pt-4">
                <Button type="submit" disabled={loading} className="bg-gradient-primary">
                  {loading ? 'Salvando...' : 'Cadastrar'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {state.fixedIncomes.length === 0 ? (
          <Card className="p-8 text-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma entrada fixa cadastrada</h3>
            <p className="text-muted-foreground mb-4">Cadastre suas receitas mensais</p>
            <Button onClick={() => setShowForm(true)} className="bg-gradient-primary">
              Cadastrar Primeira Entrada
            </Button>
          </Card>
        ) : (
          state.fixedIncomes.map((income) => (
            <Card key={income.id} className="shadow-card hover:shadow-card-hover transition-all">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-foreground">{income.description}</h3>
                      <Badge 
                        variant={income.isReceived ? "default" : "secondary"}
                        className={income.isReceived ? "bg-green-500 hover:bg-green-600" : ""}
                      >
                        {income.isReceived ? (
                          <><Check className="w-3 h-3 mr-1" /> Recebido</>
                        ) : (
                          <><Clock className="w-3 h-3 mr-1" /> Pendente</>
                        )}
                      </Badge>
                    </div>

                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <DollarSign className="w-4 h-4 text-success" />
                        <span className="font-medium text-success">{formatCurrency(income.amount)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>Dia {income.receiveDay}</span>
                      </div>
                      {income.isReceived && income.receivedBy && (
                        <div>Recebido por: <span className="font-medium">{getUserName(income.receivedBy)}</span></div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {income.isReceived ? (
                      <Button variant="outline" size="sm" onClick={() => handleUnreceive(income.id)}>
                        <X className="w-4 h-4 mr-2" /> Desfazer
                      </Button>
                    ) : (
                      <div className="flex space-x-2">
                        {state.users.map((user) => (
                          <Button 
                            key={user.id} 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleReceive(income.id, user.id)}
                            className="text-green-600 border-green-200 hover:bg-green-50"
                          >
                            <Check className="w-4 h-4 mr-1" /> Receber ({user.name})
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