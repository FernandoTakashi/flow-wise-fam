import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Calendar, DollarSign, Check, X, Clock, TrendingUp, User } from 'lucide-react';
import MonthSelector from '@/components/MonthSelector'; // Importe para ver qual mês está operando

export default function FixedIncomes() {
  const { 
    state, 
    addFixedIncome, 
    toggleFixedIncomeReceipt, // <--- Nova função
    getActiveFixedIncomes, 
    getUserName 
  } = useFinance();
  
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Lê o mês global
  const { month: selectedMonth, year: selectedYear } = state.selectedMonth;
  
  // Pega a lista filtrada e com status atualizado
  const currentMonthIncomes = getActiveFixedIncomes(selectedMonth, selectedYear);

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

  const handleToggleReceipt = async (incomeId: string, amount: number) => {
    try {
      // Chama o toggle passando o mês global
      await toggleFixedIncomeReceipt(incomeId, selectedMonth, selectedYear, amount);
    } catch (error) {
      toast({ title: 'Erro', description: 'Falha ao atualizar status', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Cabeçalho com Seletor para saber onde estamos lançando */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Entradas Fixas</h1>
          <p className="text-muted-foreground">
            Gerencie salários e receitas recorrentes
          </p>
        </div>
        
        <div className="flex gap-2">
            <MonthSelector />
            <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
                <Plus className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Nova Entrada</span>
            </Button>
        </div>
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
        {currentMonthIncomes.length === 0 ? (
          <Card className="p-8 text-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma entrada fixa ativa neste mês</h3>
            <p className="text-muted-foreground mb-4">Verifique se as datas de vigência estão corretas ou cadastre uma nova.</p>
          </Card>
        ) : (
          currentMonthIncomes.map((income) => (
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
                      {income.isReceived && income.receivedAt && (
                        <div>
                            Recebido em: <span className="font-medium">{new Date(income.receivedAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button 
                        variant={income.isReceived ? "outline" : "default"} 
                        size="sm" 
                        onClick={() => handleToggleReceipt(income.id, income.amount)}
                        className={!income.isReceived ? "text-green-600 border-green-200 hover:bg-green-50 bg-white border" : ""}
                    >
                         {income.isReceived ? (
                             <><X className="w-4 h-4 mr-2" /> Desfazer</>
                         ) : (
                             <><Check className="w-4 h-4 mr-2" /> Receber</>
                         )}
                    </Button>
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