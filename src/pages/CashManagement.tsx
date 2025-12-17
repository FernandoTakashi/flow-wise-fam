import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Wallet, Plus, ArrowUpCircle, ArrowDownCircle, History, Coins } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardCard } from '@/components/DashboardCard';

type MovementType = 'income' | 'outcome';

export default function CashManagement() {
  const { state, addCashMovement, getCurrentBalance, getDashboardData } = useFinance();
  const { toast } = useToast();
  
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: '' as MovementType,
    description: '',
    amount: '',
    userId: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.type || !formData.amount || !formData.userId || !formData.description) {
        toast({ title: "Erro", description: "Preencha todos os campos", variant: "destructive" });
        return;
    }

    setLoading(true);
    await addCashMovement({
      type: formData.type,
      description: formData.description,
      amount: parseFloat(formData.amount),
      userId: formData.userId,
      date: new Date()
    });
    setLoading(false);

    setFormData({ type: '' as MovementType, description: '', amount: '', userId: '' });
    setShowForm(false);
    toast({ title: "Sucesso", description: "Movimentação registrada!" });
  };

  const currentBalance = getCurrentBalance();
  const dashboardData = getDashboardData();
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestão de Caixa</h1>
          <p className="text-muted-foreground">Controle de entradas extras e saídas avulsas</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
          {showForm ? 'Fechar Formulário' : <><Plus className="w-4 h-4 mr-2" /> Nova Movimentação</>}
        </Button>
      </div>

      {/* Resumo Simplificado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <DashboardCard 
            title="Saldo Disponível" 
            value={formatCurrency(currentBalance)} 
            description="Líquido atual em caixa" 
            icon={<Wallet className="w-6 h-6" />} 
            variant={currentBalance >= 0 ? 'success' : 'danger'} 
        />
        <DashboardCard 
            title="Entradas Totais" 
            value={formatCurrency(dashboardData.totalIncome)} 
            description="Somatório do mês atual" 
            icon={<ArrowUpCircle className="w-6 h-6" />} 
            variant="success" 
        />
        <DashboardCard 
            title="A Receber" 
            value={formatCurrency(dashboardData.pendingIncomeValue)} 
            description="Receitas fixas pendentes" 
            icon={<Coins className="w-6 h-6" />} 
            variant="warning" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {showForm && (
          <Card className="shadow-card lg:col-span-1 border-primary/20 bg-primary/5 animate-scale-in h-fit">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Plus className="w-5 h-5 text-primary" /> Registrar Valor</CardTitle>
              <CardDescription>Entradas extras ou ajustes</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, type: value as MovementType })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Entrada (+)</SelectItem>
                      <SelectItem value="outcome">Saída (-)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input type="number" step="0.01" placeholder="0,00" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required />
                </div>

                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                    <SelectTrigger><SelectValue placeholder="Quem realizou?" /></SelectTrigger>
                    <SelectContent>
                        {state.users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea placeholder="Motivo do lançamento..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required rows={2} />
                </div>

                <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                    Registrar Lançamento
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className={`shadow-card ${showForm ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle className="text-lg flex items-center gap-2"><History className="w-5 h-5 text-primary" /> Histórico</CardTitle>
            </div>
            <Badge variant="outline">{state.cashMovements.length} Movimentações</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {state.cashMovements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((movement) => {
                const user = state.users.find(u => u.id === movement.userId);
                const isIncome = movement.type === 'income';
                
                return (
                  <div key={movement.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/20">
                    <div className="flex items-center space-x-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isIncome ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{movement.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                            {user?.name} • {format(new Date(movement.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <p className={`font-bold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(movement.amount)}
                    </p>
                  </div>
                );
              })}
              {state.cashMovements.length === 0 && (
                <p className="text-center py-10 text-muted-foreground italic">Nenhuma movimentação avulsa.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}