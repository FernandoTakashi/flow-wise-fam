import { useState, useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Calendar, DollarSign, Check, X, Clock, TrendingUp, ArrowUpCircle } from 'lucide-react';

export default function FixedIncomes() {
  const { 
    state, 
    addFixedIncome, 
    toggleFixedIncomeReceipt, 
    getActiveFixedIncomes 
  } = useFinance();
  
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const { month: selectedMonth, year: selectedYear } = state.selectedMonth;
  const currentMonthIncomes = getActiveFixedIncomes(selectedMonth, selectedYear);

  // --- CÁLCULOS DE RESUMO (Novidade para o Mobile) ---
  const totalExpected = useMemo(() => currentMonthIncomes.reduce((acc, i) => acc + i.amount, 0), [currentMonthIncomes]);
  const totalReceived = useMemo(() => currentMonthIncomes.filter(i => i.isReceived).reduce((acc, i) => acc + i.amount, 0), [currentMonthIncomes]);
  const totalPending = totalExpected - totalReceived;

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
      await toggleFixedIncomeReceipt(incomeId, selectedMonth, selectedYear, amount);
      toast({ title: "Status atualizado!" });
    } catch (error) {
      toast({ title: 'Erro', description: 'Falha ao atualizar status', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Entradas Fixas</h1>
            <p className="text-sm text-muted-foreground">Salários e receitas recorrentes</p>
          </div>
          
          <div className="flex w-full md:w-auto gap-2">
             {!showForm && (
               <Button onClick={() => setShowForm(true)} className="bg-gradient-primary shrink-0">
                 <Plus className="w-5 h-5 mr-1" /> <span className="hidden sm:inline">Nova Entrada</span>
               </Button>
             )}
          </div>
        </div>
      </div>

      {/* KPI CARDS (Resumo Financeiro) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
         <Card className="shadow-card border-l-4 border-l-primary bg-primary/5 col-span-2 md:col-span-1">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-xs md:text-sm font-medium text-primary">Total Previsto</p>
                    <p className="text-xl md:text-2xl font-bold text-foreground">{formatCurrency(totalExpected)}</p>
                </div>
                <TrendingUp className="w-6 h-6 text-primary/50 md:w-8 md:h-8" />
            </CardContent>
         </Card>
         <Card className="shadow-card border-l-4 border-l-green-500 bg-green-50/20">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-xs md:text-sm font-medium text-green-700">Recebido</p>
                    <p className="text-lg md:text-2xl font-bold text-green-600">{formatCurrency(totalReceived)}</p>
                </div>
                <Check className="w-5 h-5 text-green-300 md:w-8 md:h-8" />
            </CardContent>
         </Card>
         <Card className="shadow-card border-l-4 border-l-yellow-500 bg-yellow-50/20">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-xs md:text-sm font-medium text-yellow-700">Pendente</p>
                    <p className="text-lg md:text-2xl font-bold text-yellow-600">{formatCurrency(totalPending)}</p>
                </div>
                <Clock className="w-5 h-5 text-yellow-300 md:w-8 md:h-8" />
            </CardContent>
         </Card>
      </div>

      {/* FORMULÁRIO */}
      {showForm && (
        <Card className="shadow-card animate-in slide-in-from-top-4 border-primary/20">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Nova Entrada Fixa</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input 
                  id="description" 
                  placeholder="Ex: Salário, Aluguel Recebido" 
                  value={formData.description} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                  required 
                  className="h-11"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor (R$)</Label>
                  <Input 
                    id="amount" 
                    type="number" 
                    step="0.01" 
                    placeholder="0,00" 
                    value={formData.amount} 
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })} 
                    required 
                    className="h-11 font-bold text-green-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receiveDay">Dia Recebimento</Label>
                  <Input 
                    id="receiveDay" 
                    type="number" 
                    min="1" 
                    max="31" 
                    placeholder="Dia" 
                    value={formData.receiveDay} 
                    onChange={(e) => setFormData({ ...formData, receiveDay: e.target.value })} 
                    required 
                    className="h-11 text-center"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full h-11 bg-gradient-primary">
                {loading ? 'Salvando...' : 'Confirmar Cadastro'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* LISTA DE ENTRADAS */}
      <div className="grid gap-3">
        {currentMonthIncomes.length === 0 ? (
          <div className="text-center py-10 bg-muted/10 rounded-lg border border-dashed">
            <ArrowUpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-sm font-medium text-foreground">Nenhuma entrada fixa</h3>
            <p className="text-xs text-muted-foreground mt-1">Cadastre seu salário ou rendas mensais.</p>
          </div>
        ) : (
          currentMonthIncomes.map((income) => (
            <Card key={income.id} className={`shadow-sm transition-all border ${income.isReceived ? 'bg-muted/30 opacity-70' : 'bg-card border-l-4 border-l-green-500'}`}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
                  
                  {/* Info da Entrada */}
                  <div className="flex-1">
                    <div className="flex justify-between items-start md:block mb-1 md:mb-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base md:text-lg font-semibold truncate">{income.description}</h3>
                            <Badge 
                                variant={income.isReceived ? "default" : "secondary"}
                                className={income.isReceived ? "bg-green-600 hover:bg-green-700" : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"}
                            >
                                {income.isReceived ? "Recebido" : "Pendente"}
                            </Badge>
                        </div>
                        {/* Valor em destaque no mobile (canto direito superior) */}
                        <span className="font-bold text-lg text-green-600 md:hidden">
                            {formatCurrency(income.amount)}
                        </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="font-bold text-green-600 hidden md:inline">
                         {formatCurrency(income.amount)}
                      </span>
                      <span className="flex items-center gap-1 text-xs md:text-sm">
                        <Calendar className="w-3 h-3" /> Dia {income.receiveDay}
                      </span>
                      {income.isReceived && income.receivedAt && (
                        <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                            <Check className="w-3 h-3" /> {new Date(income.receivedAt).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Botão de Ação */}
                  <div className="w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 mt-2 md:mt-0">
                    <Button 
                      variant={income.isReceived ? "outline" : "default"} 
                      size="sm" 
                      onClick={() => handleToggleReceipt(income.id, income.amount)}
                      className={`w-full md:w-auto h-10 ${income.isReceived ? 'border-dashed text-muted-foreground hover:bg-muted' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                    >
                      {income.isReceived ? (
                        <><X className="w-4 h-4 mr-2" /> Desmarcar</>
                      ) : (
                        <><Check className="w-4 h-4 mr-2" /> Confirmar Recebimento</>
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