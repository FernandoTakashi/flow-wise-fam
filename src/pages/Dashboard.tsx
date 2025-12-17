import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import MonthSelector from '@/components/MonthSelector';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowUpCircle, Calendar, ShoppingCart, PiggyBank, Target, 
  AlertCircle, CreditCard, ChevronDown, ChevronUp, Check, Wallet, Clock 
} from 'lucide-react';

export default function Dashboard() {
  const { getDashboardData, state, toggleFixedExpensePayment, updateCreditCard } = useFinance();
  const { toast } = useToast();
  
  const dashboardData = getDashboardData();
  const { month, year } = state.selectedMonth;

  const [isFixedOpen, setIsFixedOpen] = useState(false);
  const [isCardsOpen, setIsCardsOpen] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handlePayFixed = async (id: string, amount: number) => {
    try {
      await toggleFixedExpensePayment(id, month, year, amount);
      toast({ title: "Pago!", description: "Conta fixa atualizada." });
    } catch (error) {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  const handlePayCard = async (id: string) => {
    try {
      await updateCreditCard(id, { isPaid: true, paidAt: new Date() });
      toast({ title: "Fatura Paga!", description: "Cartão atualizado." });
    } catch (error) {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral das finanças</p>
        </div>
        <MonthSelector />
      </div>

      {/* Grid Expandido com os Novos Indicadores */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        
        {/* 1. Saldo Atual */}
        <Card className="shadow-card border-l-4 border-l-emerald-600 bg-emerald-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-emerald-800">Saldo em Caixa</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{formatCurrency(dashboardData.currentBalance)}</div>
            <p className="text-xs text-muted-foreground font-medium">Disponível agora</p>
          </CardContent>
        </Card>

        {/* 2. Projeção Final */}
        <Card className="shadow-card border-l-4 border-l-primary bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-primary">Projeção Final</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(dashboardData.projectedBalance)}</div>
            <p className="text-xs text-muted-foreground font-medium">Previsão fim do mês</p>
          </CardContent>
        </Card>

        {/* 3. Total Investido */}
        <Card className="shadow-card border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investido</CardTitle>
            <PiggyBank className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(dashboardData.totalInvestments)}</div>
            <p className="text-xs text-muted-foreground">Patrimônio Acumulado</p>
          </CardContent>
        </Card>
        
        {/* Card vazio para completar linha ou pode ser usado para Entradas Totais */}
        <Card className="shadow-card border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entradas Totais</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(dashboardData.totalIncome)}</div>
            <p className="text-xs text-muted-foreground">Previsto no mês</p>
          </CardContent>
        </Card>

      </div>

      {/* LINHA DE FLUXO PENDENTE (O QUE VOCÊ PEDIU) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        
        {/* NOVO: Falta Receber */}
        <Card className="shadow-card border border-green-200 bg-green-50/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700">A Receber (Restante)</CardTitle>
            <Clock className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(dashboardData.pendingIncomeValue)}</div>
            <p className="text-xs text-muted-foreground">Entradas fixas pendentes</p>
          </CardContent>
        </Card>

         {/* NOVO: Falta Pagar */}
         <Card className="shadow-card border border-red-200 bg-red-50/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700">A Pagar (Restante)</CardTitle>
            <Clock className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(dashboardData.pendingFixedExpensesValue)}</div>
            <p className="text-xs text-muted-foreground">Contas fixas pendentes</p>
          </CardContent>
        </Card>

        {/* Despesas Variáveis */}
        <Card className="shadow-card border-l-4 border-l-yellow-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Despesas Variáveis</CardTitle>
            <ShoppingCart className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{formatCurrency(dashboardData.variableExpenses)}</div>
            <p className="text-xs text-muted-foreground">Cartão, Pix e Débito</p>
          </CardContent>
        </Card>

      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        
        {/* Pendências (Lista Interativa) */}
        <Card className="col-span-1 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Contas Abertas</CardTitle>
            <CardDescription>O que falta pagar em {month + 1}/{year}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {/* Dropdown Fixas */}
            <div className="border rounded-lg p-2 bg-muted/20">
              <button 
                onClick={() => setIsFixedOpen(!isFixedOpen)}
                className="flex items-center justify-between w-full p-1 hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium">Contas Fixas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-orange-600">{dashboardData.pendingFixedExpenses}</span>
                  {isFixedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {isFixedOpen && (
                <div className="mt-3 space-y-2 animate-in slide-in-from-top-2">
                  {dashboardData.pendingFixedList.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground">Tudo pago!</p>
                  ) : (
                    dashboardData.pendingFixedList.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-white p-2 rounded border text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-xs text-muted-foreground">Vence dia {item.dueDay}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{formatCurrency(item.amount)}</span>
                          <Button size="icon" className="h-6 w-6" onClick={() => handlePayFixed(item.id, item.amount)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Dropdown Cartões */}
            <div className="border rounded-lg p-2 bg-muted/20">
              <button 
                onClick={() => setIsCardsOpen(!isCardsOpen)}
                className="flex items-center justify-between w-full p-1 hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Cartões de Crédito</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-purple-600">{dashboardData.pendingCreditCards}</span>
                  {isCardsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {isCardsOpen && (
                <div className="mt-3 space-y-2 animate-in slide-in-from-top-2">
                   {dashboardData.pendingCreditCardList.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground">Nenhuma fatura aberta.</p>
                  ) : (
                    dashboardData.pendingCreditCardList.map(card => (
                      <div key={card.id} className="flex items-center justify-between bg-white p-2 rounded border text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{card.name}</span>
                          <span className="text-xs text-muted-foreground">Fecha dia {card.closingDay}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="text-right mr-2">
                              <span className="block font-bold text-foreground">{formatCurrency(card.billAmount)}</span>
                              <span className="text-[10px] text-muted-foreground block">Limite: {formatCurrency(card.limit)}</span>
                           </div>
                          <Button size="icon" className="h-6 w-6" onClick={() => handlePayCard(card.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

          </CardContent>
        </Card>

        {/* Quem gastou mais */}
        <Card className="col-span-1 md:col-span-2 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Quem gastou mais</CardTitle>
            <CardDescription>Ranking de despesas variáveis do mês</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboardData.topUsers.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhum gasto registrado neste mês.</p>
              ) : (
                dashboardData.topUsers.map((user) => (
                  <div key={user.userId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{user.userName}</span>
                      <span className="text-muted-foreground">{formatCurrency(user.totalAmount)}</span>
                    </div>
                    <Progress 
                      value={dashboardData.variableExpenses > 0 ? (user.totalAmount / dashboardData.variableExpenses) * 100 : 0} 
                      className="h-2" 
                    />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}