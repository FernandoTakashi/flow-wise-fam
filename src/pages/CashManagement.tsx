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
import { Wallet, TrendingUp, Plus, ArrowUpCircle, ArrowDownCircle, History, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardCard } from '@/components/DashboardCard';

type MovementType = 'income' | 'outcome';

export default function CashManagement() {
  const { state, addCashMovement, updateSettings, getCurrentBalance } = useFinance();
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
    if (!formData.type || !formData.amount || !formData.userId || !formData.description) return;

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
  };

  const handleUpdateYield = async (value: string) => {
     const newYield = parseFloat(value) || 0;
     await updateSettings({ monthlyYield: newYield });
  };

  const currentBalance = getCurrentBalance();
  const totalIncome = state.cashMovements.filter(m => m.type === 'income').reduce((sum, m) => sum + Number(m.amount), 0);
  const totalOutcome = state.cashMovements.filter(m => m.type === 'outcome').reduce((sum, m) => sum + Number(m.amount), 0);
  const projectedBalance = currentBalance * (1 + state.settings.monthlyYield / 100);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestão de Caixa</h1>
          <p className="text-muted-foreground">Controle de entradas, saídas e saldo disponível</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" /> {showForm ? 'Cancelar' : 'Nova Movimentação'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <DashboardCard title="Saldo Atual" value={formatCurrency(currentBalance)} description="Disponível em caixa" icon={<Wallet className="w-6 h-6" />} variant={currentBalance > 0 ? 'success' : 'danger'} />
        <DashboardCard title="Total de Entradas" value={formatCurrency(totalIncome)} description="Receitas acumuladas" icon={<ArrowUpCircle className="w-6 h-6" />} variant="success" />
        <DashboardCard title="Total de Saídas" value={formatCurrency(totalOutcome)} description="Gastos acumulados" icon={<ArrowDownCircle className="w-6 h-6" />} variant="danger" />
        <DashboardCard title="Projeção c/ Rendimento" value={formatCurrency(projectedBalance)} description={`${state.settings.monthlyYield}% ao mês`} icon={<TrendingUp className="w-6 h-6" />} variant="success" trend="up" trendValue={`+${(projectedBalance - currentBalance).toFixed(2)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {showForm && (
          <Card className="shadow-card lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2"><Plus className="w-5 h-5 text-primary" /><span>Nova Movimentação</span></CardTitle>
              <CardDescription>Registrar entrada ou saída de dinheiro</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, type: value as MovementType })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income"><div className="flex items-center space-x-2"><ArrowUpCircle className="w-4 h-4 text-success" /><span>Entrada</span></div></SelectItem>
                      <SelectItem value="outcome"><div className="flex items-center space-x-2"><ArrowDownCircle className="w-4 h-4 text-destructive" /><span>Saída</span></div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Valor *</Label><Input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required /></div>
                <div className="space-y-2">
                  <Label>Usuário Responsável *</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{state.users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Descrição *</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required rows={3} /></div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary">{loading ? 'Salvando...' : 'Registrar'}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className={`shadow-card ${showForm ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2"><History className="w-5 h-5 text-primary" /><span>Histórico</span></CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {state.cashMovements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((movement) => {
                const user = state.users.find(u => u.id === movement.userId);
                return (
                  <div key={movement.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${movement.type === 'income' ? 'bg-success/20' : 'bg-destructive/20'}`}>
                        {movement.type === 'income' ? <ArrowUpCircle className="w-5 h-5 text-success" /> : <ArrowDownCircle className="w-5 h-5 text-destructive" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{movement.description}</p>
                        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                          <span>{user?.name || 'Usuário'}</span><span>•</span><span>{format(new Date(movement.date), 'dd/MM/yyyy - HH:mm', { locale: ptBR })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${movement.type === 'income' ? 'text-success' : 'text-destructive'}`}>{movement.type === 'income' ? '+' : '-'}{formatCurrency(movement.amount)}</p>
                      <Badge variant={movement.type === 'income' ? 'default' : 'secondary'} className="text-xs">{movement.type === 'income' ? 'Entrada' : 'Saída'}</Badge>
                    </div>
                  </div>
                );
              })}
              {state.cashMovements.length === 0 && <p className="text-center py-4 text-muted-foreground">Nenhuma movimentação.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2"><Settings className="w-5 h-5 text-primary" /><span>Configurações de Rendimento</span></CardTitle>
          <CardDescription>Configure o percentual de rendimento mensal para projeções</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Label htmlFor="yield">Rendimento Mensal (%)</Label>
              <Input id="yield" type="number" step="0.01" defaultValue={state.settings.monthlyYield} onBlur={(e) => handleUpdateYield(e.target.value)} className="mt-1" />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Rendimento atual: <span className="font-medium">{state.settings.monthlyYield}%</span></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}