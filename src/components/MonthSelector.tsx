import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS_PT } from '@/lib/dates';

export default function MonthSelector() {
  const { selectedMonth, setSelectedMonth } = useFinance();
  const { month, year } = selectedMonth;

  const shift = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setSelectedMonth({ month: m, year: y });
  };

  const goToday = () => {
    const now = new Date();
    setSelectedMonth({ month: now.getMonth(), year: now.getFullYear() });
  };

  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-1">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shift(-1)} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <button
        onClick={goToday}
        className="min-w-[112px] text-center text-sm font-semibold capitalize"
        title="Voltar para o mês atual"
      >
        {MONTHS_PT[month]} <span className="font-normal text-muted-foreground">{year}</span>
      </button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shift(1)} aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
