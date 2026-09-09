import { useFinance } from '@/contexts/FinanceContext';
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
    <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
      <button
        onClick={() => shift(-1)}
        aria-label="Mês anterior"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#F3EBE5]"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={goToday}
        title="Voltar para o mês atual"
        className="min-w-[124px] text-center text-[13.5px] font-semibold capitalize text-foreground"
      >
        {MONTHS_PT[month]} <span className="font-normal text-muted-foreground">{year}</span>
      </button>
      <button
        onClick={() => shift(1)}
        aria-label="Próximo mês"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#F3EBE5]"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
