import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext'; // <--- O SEGREDO ESTÁ AQUI

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
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
      years.push(i);
    }
    return years;
  };

  return (
    <Card className="shadow-card w-full md:w-auto">
      <CardContent className="p-2 md:p-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground capitalize whitespace-nowrap">
              {months[selectedMonth]} {selectedYear}
            </h2>
          </div>

          <div className="flex items-center space-x-1 md:space-x-2">
            <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <Button variant="outline" size="sm" onClick={goToCurrentMonth}>
              Hoje
            </Button>

            <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}>
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button variant="outline" size="sm" onClick={() => setShowSelectors(!showSelectors)}>
              {showSelectors ? 'Ocultar' : 'Mudar'}
            </Button>
          </div>
        </div>

        {showSelectors && (
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Mês</label>
              <Select 
                value={selectedMonth.toString()} 
                onValueChange={(value) => handleMonthChange(parseInt(value), selectedYear)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((month, index) => (
                    <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Ano</label>
              <Select 
                value={selectedYear.toString()} 
                onValueChange={(value) => handleMonthChange(selectedMonth, parseInt(value))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {generateYearOptions().map((year) => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}