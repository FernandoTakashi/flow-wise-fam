import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Calendar, Filter } from 'lucide-react'; // Ícone de filtro
import { useFinance } from '@/contexts/FinanceContext';

const months = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function MonthSelector() {
  const { state, dispatch } = useFinance();
  const [showSelectors, setShowSelectors] = useState(false);

  // Lê do Estado Global
  const { month: selectedMonth, year: selectedYear } = state.selectedMonth;

  // Escreve no Estado Global
  const handleMonthChange = (newMonth: number, newYear: number) => {
    dispatch({ 
      type: 'SET_SELECTED_MONTH', 
      payload: { month: newMonth, year: newYear } 
    });
    // Opcional: Fechar seletores após escolha no mobile para limpar a tela
    // setShowSelectors(false); 
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    let newMonth = selectedMonth;
    let newYear = selectedYear;

    if (direction === 'prev') {
      newMonth--;
      if (newMonth < 0) {
        newMonth = 11;
        newYear--;
      }
    } else {
      newMonth++;
      if (newMonth > 11) {
        newMonth = 0;
        newYear++;
      }
    }
    handleMonthChange(newMonth, newYear);
  };

  const goToCurrentMonth = () => {
    const now = new Date();
    handleMonthChange(now.getMonth(), now.getFullYear());
  };

  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 2; i <= currentYear + 3; i++) { // Reduzi o range para ficar mais limpo
      years.push(i);
    }
    return years;
  };

  return (
    <Card className="shadow-sm w-full md:w-auto border-none bg-background/50 backdrop-blur-sm">
      <CardContent className="p-2">
        <div className="flex items-center justify-between gap-2">
          
          {/* Esquerda: Mês Atual */}
          <div className="flex items-center gap-2 px-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold capitalize whitespace-nowrap">
              {months[selectedMonth]} <span className="text-muted-foreground font-normal">{selectedYear}</span>
            </span>
          </div>

          {/* Direita: Controles */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="sm" className="h-8 text-xs font-medium px-2 hidden sm:flex" onClick={goToCurrentMonth}>
              Hoje
            </Button>

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth('next')}>
              <ChevronRight className="w-4 h-4" />
            </Button>

            {/* Botão de Filtro Avançado (Mudar) */}
            <Button 
              variant={showSelectors ? "secondary" : "ghost"} 
              size="icon" 
              className="h-8 w-8 ml-1"
              onClick={() => setShowSelectors(!showSelectors)}
            >
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Seletores Expansíveis */}
        {showSelectors && (
          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border/50 animate-in slide-in-from-top-1 fade-in duration-200">
            <Select 
              value={selectedMonth.toString()} 
              onValueChange={(value) => handleMonthChange(parseInt(value), selectedYear)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((month, index) => (
                  <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select 
              value={selectedYear.toString()} 
              onValueChange={(value) => handleMonthChange(selectedMonth, parseInt(value))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {generateYearOptions().map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Botão "Hoje" visível apenas quando expandido no mobile */}
            <Button variant="outline" size="sm" className="col-span-2 h-8 text-xs sm:hidden mt-1" onClick={goToCurrentMonth}>
              Voltar para Hoje
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}