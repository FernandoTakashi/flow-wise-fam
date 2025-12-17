import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowUpCircle, ShoppingCart, PiggyBank, Target, 
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* HEADER: Flexível para Mobile */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Visão geral das finanças</p>
          </div>
        </div>
      </div>

      {/* BLOCO 1: INDICADORES PRINCIPAIS (Grid 2x2 no Mobile) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        
        {/* 1. Saldo Atual */}
        <Card className="shadow-card border-l-4 border-l-emerald-600 bg-emerald-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
            <CardTitle className="text-xs md:text-sm font-bold text-emerald-800">Saldo em Caixa</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-lg md:text-2xl font-bold text-emerald-700 break-words">
              {formatCurrency(dashboardData.currentBalance)}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground font-medium">Disponível agora</p>
          </CardContent>
        </Card>

        {/* 2. Projeção Final */}
        <Card className="shadow-card border-l-4 border-l-primary bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
            <CardTitle className="text-xs md:text-sm font-bold text-primary">Projeção Final</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-lg md:text-2xl font-bold text-primary break-words">
              {formatCurrency(dashboardData.projectedBalance)}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground font-medium">Previsão fim do mês</p>
          </CardContent>
        </Card>

        {/* 3. Total Investido */}
        <Card className="shadow-card border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
            <CardTitle className="text-xs md:text-sm font-medium">Investido</CardTitle>
            <PiggyBank className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-lg md:text-2xl font-bold text-blue-600 break-words">
              {formatCurrency(dashboardData.totalInvestments)}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Patrimônio</p>
          </CardContent>
        </Card>
        
        {/* 4. Entradas Totais */}
        <Card className="shadow-card border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
            <CardTitle className="text-xs md:text-sm font-medium">Entradas</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-lg md:text-2xl font-bold text-green-600 break-words">
              {formatCurrency(dashboardData.totalIncome)}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Previsto</p>
          </CardContent>
        </Card>

      </div>

      {/* BLOCO 2: FLUXO DE CAIXA E PENDÊNCIAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        
        {/* Falta Receber */}
        <Card className="shadow-card border border-green-200 bg-green-50/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-green-700">A Receber</CardTitle>
            <Clock className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl md:text-2xl font-bold text-green-600">
              {formatCurrency(dashboardData.pendingIncomeValue)}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Pendente</p>
          </CardContent>
        </Card>

         {/* Falta Pagar */}
         <Card className="shadow-card border border-red-200 bg-red-50/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-red-700">A Pagar</CardTitle>
            <Clock className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl md:text-2xl font-bold text-red-600">
              {formatCurrency(dashboardData.pendingFixedExpensesValue)}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Pendente</p>
          </CardContent>
        </Card>

        {/* Despesas Variáveis */}
        <Card className="shadow-card border-l-4 border-l-yellow-500 md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
            <CardTitle className="text-xs md:text-sm font-medium">Gastos Variáveis</CardTitle>
            <ShoppingCart className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl md:text-2xl font-bold text-yellow-600">
              {formatCurrency(dashboardData.variableExpenses)}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Cartão, Pix e Débito</p>
          </CardContent>
        </Card>

      </div>

      {/* BLOCO 3: DETALHAMENTO (Grid Ajustado) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Pendências (Lista Interativa) */}
        <Card className="col-span-1 shadow-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base md:text-lg">Contas Abertas</CardTitle>
            <CardDescription className="text-xs">O que falta pagar em {month + 1}/{year}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-2">
            
            {/* Dropdown Fixas */}
            <div className="border rounded-lg bg-muted/20">
              <button 
                onClick={() => setIsFixedOpen(!isFixedOpen)}
                className="flex items-center justify-between w-full p-3 hover:bg-muted/30 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium">Contas Fixas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-orange-600 text-sm">{dashboardData.pendingFixedExpenses}</span>
                  {isFixedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              
              {isFixedOpen && (
                <div className="p-2 pt-0 space-y-2 animate-in slide-in-from-top-2">
                  <div className="h-px bg-border mb-2 mx-2" />
                  {dashboardData.pendingFixedList.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground py-2">Tudo pago!</p>
                  ) : (
                    dashboardData.pendingFixedList.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-background p-3 rounded-md border text-sm shadow-sm">
                        <div className="flex flex-col">
                          <span className="font-medium truncate max-w-[120px]">{item.name}</span>
                          <span className="text-[10px] text-muted-foreground">Vence dia {item.dueDay}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{formatCurrency(item.amount)}</span>
                          <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => handlePayFixed(item.id, item.amount)}>
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Dropdown Cartões */}
            <div className="border rounded-lg bg-muted/20">
              <button 
                onClick={() => setIsCardsOpen(!isCardsOpen)}
                className="flex items-center justify-between w-full p-3 hover:bg-muted/30 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Cartões</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-purple-600 text-sm">{dashboardData.pendingCreditCards}</span>
                  {isCardsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              
              {isCardsOpen && (
                <div className="p-2 pt-0 space-y-2 animate-in slide-in-from-top-2">
                   <div className="h-px bg-border mb-2 mx-2" />
                   {dashboardData.pendingCreditCardList.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground py-2">Nenhuma fatura aberta.</p>
                  ) : (
                    dashboardData.pendingCreditCardList.map(card => (
                      <div key={card.id} className="flex items-center justify-between bg-background p-3 rounded-md border text-sm shadow-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{card.name}</span>
                          <span className="text-[10px] text-muted-foreground">Fecha dia {card.closingDay}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="text-right">
                              <span className="block font-bold text-foreground text-sm">{formatCurrency(card.billAmount)}</span>
                              <span className="text-[10px] text-muted-foreground block">Limite: {formatCurrency(card.limit)}</span>
                           </div>
                          <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => handlePayCard(card.id)}>
                            <Check className="h-4 w-4" />
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
        <Card className="col-span-1 lg:col-span-2 shadow-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base md:text-lg">Quem gastou mais</CardTitle>
            <CardDescription className="text-xs">Ranking de despesas variáveis do mês</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-4">
              {dashboardData.topUsers.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">Nenhum gasto registrado neste mês.</p>
              ) : (
                dashboardData.topUsers.map((user) => (
                  <div key={user.userId} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {user.userName.charAt(0)}
                        </div>
                        {user.userName}
                      </span>
                      <span className="font-semibold text-muted-foreground">{formatCurrency(user.totalAmount)}</span>
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