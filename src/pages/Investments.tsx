import { useState, useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, TrendingUp, CalendarIcon, Percent, PiggyBank, User, X, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Investments() {
  const { state, addInvestment, getTotalInvestments, getInvestmentYield } = useFinance();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Formulário agora inclui yieldRate
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    yieldRate: '', // Campo novo
    userId: '',
    date: new Date()
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // Cálculo da Taxa Média Ponderada da Carteira (KPI Visual)
  // Fórmula: Soma(Valor * Taxa) / Valor Total
  const weightedAverageRate = useMemo(() => {
    const totalVal = getTotalInvestments();
    if (totalVal === 0) return 0;
    
    const weightedSum = state.investments.reduce((acc, inv) => {
      return acc + (Number(inv.amount) * Number(inv.yieldRate || 0));
    }, 0);

    return (weightedSum / totalVal).toFixed(2);
  }, [state.investments, getTotalInvestments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.description || !formData.amount || !formData.userId) {
      toast({ title: 'Erro', description: 'Preencha os campos obrigatórios', variant: 'destructive' });
      return;
    }

    setLoading(true);
    await addInvestment({
      description: formData.description,
      amount: parseFloat(formData.amount),
      yieldRate: parseFloat(formData.yieldRate) || 0, // Envia a taxa individual
      date: formData.date,
      userId: formData.userId
    });
    setLoading(false);

    setFormData({ description: '', amount: '', yieldRate: '', userId: '', date: new Date() });
    setShowForm(false);
    toast({ title: 'Aplicação registrada com sucesso!' });
  };

  const getUserName = (userId: string) => {
    return state.users.find(user => user.id === userId)?.name || 'Usuário';
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Investimentos</h1>
          <p className="text-sm text-muted-foreground">Carteira de ativos e rendimentos</p>
        </div>
        
        {/* Botão de Ação */}
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="w-full md:w-auto bg-gradient-primary h-11 md:h-10 text-base">
            <Plus className="w-5 h-5 mr-2" /> Nova Aplicação
          </Button>
        )}
      </div>

      {/* CARDS DE RESUMO (KPIs) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
        
        {/* Total Investido (Destaque - 2 colunas no mobile) */}
        <Card className="shadow-card col-span-2 md:col-span-1 border-l-4 border-l-primary bg-primary/5">
          <CardContent className="p-4 md:p-6 flex items-center justify-between">
            <div>
               <p className="text-xs md:text-sm font-medium text-primary">Total Acumulado</p>
               <p className="text-2xl md:text-3xl font-bold text-foreground">{formatCurrency(getTotalInvestments())}</p>
            </div>
            <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <PiggyBank className="w-6 h-6 text-primary" />
            </div>
          </CardContent>
        </Card>

        {/* Rendimento Mensal (Soma dos individuais) */}
        <Card className="shadow-card">
          <CardContent className="p-4 md:p-6 flex flex-col justify-between h-full">
             <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="w-4 h-4" />
                <p className="text-xs md:text-sm font-medium">Rendimento Mês</p>
             </div>
             <p className="text-xl md:text-2xl font-bold text-success">{formatCurrency(getInvestmentYield())}</p>
          </CardContent>
        </Card>

        {/* Taxa Média Ponderada */}
        <Card className="shadow-card">
          <CardContent className="p-4 md:p-6 flex flex-col justify-between h-full">
             <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Target className="w-4 h-4" />
                <p className="text-xs md:text-sm font-medium">Rentabilidade Média</p>
             </div>
             <div className="flex items-baseline gap-1">
                <p className="text-xl md:text-2xl font-bold">{weightedAverageRate}%</p>
                <span className="text-xs text-muted-foreground">a.m.</span>
             </div>
          </CardContent>
        </Card>
      </div>

      {/* FORMULÁRIO DE NOVA APLICAÇÃO */}
      {showForm && (
        <Card className="shadow-card animate-in slide-in-from-top-4 border-primary/20">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Nova Aplicação</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} className="h-8 w-8"><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Ativo / Descrição</Label>
                <Input 
                    placeholder="Ex: CDB Nubank, FII MXRF11" 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                    required 
                    className="h-11"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="0,00"
                        value={formData.amount} 
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })} 
                        required 
                        className="h-11 font-bold text-foreground"
                    />
                  </div>
                  
                  {/* CAMPO DE TAXA INDIVIDUAL */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-xs md:text-sm">Taxa (% a.m.)</Label>
                    <div className="relative">
                        <Input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00"
                            value={formData.yieldRate} 
                            onChange={(e) => setFormData({ ...formData, yieldRate: e.target.value })} 
                            className="h-11 pl-8"
                        />
                        <Percent className="w-4 h-4 absolute left-2.5 top-3.5 text-muted-foreground" />
                    </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Select onValueChange={(value) => setFormData({ ...formData, userId: value })}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Quem investiu?" /></SelectTrigger>
                        <SelectContent>
                            {state.users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-11", !formData.date && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.date ? format(formData.date, "dd/MM/yy") : <span>Data</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                        <Calendar mode="single" selected={formData.date} onSelect={(date) => date && setFormData({ ...formData, date })} initialFocus />
                        </PopoverContent>
                    </Popover>
                  </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-primary text-base">
                  {loading ? 'Salvando...' : 'Confirmar Aplicação'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* HISTÓRICO DE APLICAÇÕES */}
      <Card className="shadow-card border-none bg-transparent shadow-none md:border md:bg-card">
        <CardHeader className="px-0 md:px-6 py-2 md:py-6">
            <CardTitle className="text-lg md:text-xl">Carteira Atual</CardTitle>
        </CardHeader>
        <CardContent className="px-0 md:px-6">
          {state.investments.length === 0 ? (
            <div className="text-center py-10 bg-card rounded-lg border border-dashed">
                <PiggyBank className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Nenhuma aplicação registrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {state.investments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((investment) => (
                <div key={investment.id} className="flex flex-col p-4 bg-card rounded-lg border shadow-sm">
                  
                  {/* Linha 1: Descrição e Valor */}
                  <div className="flex justify-between items-start mb-2">
                     <span className="font-semibold text-base text-foreground line-clamp-1">{investment.description}</span>
                     <span className="font-bold text-lg text-primary whitespace-nowrap">+{formatCurrency(investment.amount)}</span>
                  </div>

                  {/* Linha 2: Detalhes e Taxa */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                     <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" />
                            {format(new Date(investment.date), "dd/MM/yy")}
                        </span>
                        <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {getUserName(investment.userId).split(' ')[0]}
                        </span>
                     </div>
                     
                     {/* Badge da Taxa Individual */}
                     <Badge variant="outline" className="bg-secondary/50 border-secondary-foreground/20 text-secondary-foreground">
                        {investment.yieldRate > 0 ? `+${investment.yieldRate}% a.m.` : '0%'}
                     </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}