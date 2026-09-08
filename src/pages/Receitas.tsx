import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MONTHS_PT } from '@/lib/dates';
import Transactions from './Transactions';
import Recurrences from './Recurrences';

type Aba = 'avulsas' | 'recorrentes';

export default function Receitas() {
  const { selectedMonth } = useFinance();
  const { month, year } = selectedMonth;
  const [aba, setAba] = useState<Aba>('avulsas');

  return (
    <div className="space-y-5">
      <PageHeader title="Receitas" subtitle={`${MONTHS_PT[month]} de ${year}`} />

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="avulsas">Avulsas</TabsTrigger>
          <TabsTrigger value="recorrentes">Recorrentes</TabsTrigger>
        </TabsList>
      </Tabs>

      {aba === 'avulsas'
        ? <Transactions kind="income" embedded />
        : <Recurrences kind="income" embedded />}
    </div>
  );
}
