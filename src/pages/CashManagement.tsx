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
import { Wallet, Plus, ArrowUpCircle, ArrowDownCircle, History, Coins, X } from 'lucide-react';
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
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Gestão de Caixa</h1>
          <p className="text-sm text-muted-foreground">Entradas extras e saídas avulsas</p>
        </div>
        
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="bg-gradient-primary w-full md:w-auto h-11 md:h-10 text-base">
            <Plus className="w-5 h-5 mr-2" /> Nova Movimentação
          </Button>
        )}
      </div>

      {/* KPI CARDS (Grid Responsivo) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
        <DashboardCard 
            title="Saldo Disponível" 
            value={formatCurrency(currentBalance)} 
            description="Líquido atual em caixa" 
            icon={<Wallet className="w-6 h-6" />} 
            variant={currentBalance >= 0 ? 'success' : 'danger'} 
        />
        
        {/* Agrupa cards menores no mobile se quiser economizar espaço, ou mantém stack */}
        <div className="grid grid-cols-2 sm:grid-cols-1 lg:grid-cols-2 gap-3 md:gap-6 col-span-1 lg:col-span-2">
            <DashboardCard 
                title="Entradas Totais" 
                value={formatCurrency(dashboardData.totalIncome)} 
                description="Mês atual" 
                icon={<ArrowUpCircle className="w-6 h-6" />} 
                variant="success" 
            />
            <DashboardCard 
                title="A Receber" 
                value={formatCurrency(dashboardData.pendingIncomeValue)} 
                description="Pendente" 
                icon={<Coins className="w-6 h-6" />} 
                variant="warning" 
            />
        </div>
      </div>

      {/* FORMULÁRIO */}
      {showForm && (
        <Card className="shadow-card border-primary/20 bg-primary/5 animate-in slide-in-from-top-4">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Plus className="w-5 h-5 text-primary" /> Registrar Valor</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} className="h-8 w-8"><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Botões de Tipo (Segmented Control Visual) */}
              <div className="grid grid-cols-2 gap-4">
                 <div 
                    onClick={() => setFormData({...formData, type: 'income'})}
                    className={`cursor-pointer border rounded-lg p-3 text-center transition-all ${formData.type === 'income' ? 'bg-green-100 border-green-500 text-green-700 font-bold shadow-sm' : 'bg-background hover:bg-muted'}`}
                 >
                    <ArrowUpCircle className="w-6 h-6 mx-auto mb-1 text-green-600" />
                    Entrada
                 </div>
                 <div 
                    onClick={() => setFormData({...formData, type: 'outcome'})}
                    className={`cursor-pointer border rounded-lg p-3 text-center transition-all ${formData.type === 'outcome' ? 'bg-red-100 border-red-500 text-red-700 font-bold shadow-sm' : 'bg-background hover:bg-muted'}`}
                 >
                    <ArrowDownCircle className="w-6 h-6 mx-auto mb-1 text-red-600" />
                    Saída
                 </div>
              </div>

              <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder="0,00" 
                    value={formData.amount} 
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })} 
                    required 
                    className="h-12 text-lg font-bold"
                  />
              </div>

              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Quem realizou?" /></SelectTrigger>
                  <SelectContent>
                      {state.users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea 
                    placeholder="Motivo do lançamento..." 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                    required 
                    rows={2} 
                    className="resize-none"
                  />
              </div>

              <Button type="submit" disabled={loading} className="w-full h-12 bg-primary hover:bg-primary/90 text-base font-semibold">
                  {loading ? 'Salvando...' : 'Confirmar Lançamento'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* HISTÓRICO */}
      <Card className="shadow-card border-none bg-transparent shadow-none md:border md:bg-card md:shadow-sm">
        <CardHeader className="px-0 md:px-6 py-2 md:py-6 flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2"><History className="w-5 h-5 text-primary" /> Histórico</CardTitle>
          <Badge variant="outline">{state.cashMovements.length} Itens</Badge>
        </CardHeader>
        <CardContent className="px-0 md:px-6">
          <div className="space-y-3">
            {state.cashMovements.length === 0 ? (
              <div className="text-center py-10 bg-card rounded-lg border border-dashed">
                 <History className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                 <p className="text-muted-foreground">Nenhuma movimentação avulsa.</p>
              </div>
            ) : (
              state.cashMovements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((movement) => {
                const user = state.users.find(u => u.id === movement.userId);
                const isIncome = movement.type === 'income';
                
                return (
                  <div key={movement.id} className="flex items-center justify-between p-4 rounded-xl bg-card border shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isIncome ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-semibold text-sm line-clamp-1">{movement.description}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                           <span>{format(new Date(movement.date), "dd/MM HH:mm")}</span>
                           <span>•</span>
                           <span>{user?.name.split(' ')[0]}</span>
                        </p>
                      </div>
                    </div>
                    <p className={`font-bold text-base ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(movement.amount)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}