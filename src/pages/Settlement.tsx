import { useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { MONTHS_PT } from '@/lib/dates';
import { Scale } from 'lucide-react';

export default function Settlement() {
  const {
    loading, selectedMonth, members, memberName, spendByMember, jointSpendCents,
  } = useFinance();
  const { month, year } = selectedMonth;

  const ranking = useMemo(() => spendByMember(month, year), [spendByMember, month, year]);
  const joint = jointSpendCents(month, year);

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="space-y-5">
      <PageHeader title="Acerto de contas" subtitle={`Quanto cada um gastou em ${MONTHS_PT[month].toLowerCase()}`} />

      <Card>
        <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Gasto por pessoa</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-4 pt-2">
          {members.map((m) => {
            const r = ranking.find((x) => x.memberId === m.userId);
            return (
              <div key={m.userId} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span className="font-medium">{memberName(m.userId)}</span>
                <span className="font-semibold tabular-nums">{formatBRL(r?.totalCents ?? 0)}</span>
              </div>
            );
          })}
          <div className="flex items-center justify-between rounded-md border border-[#DCEDE7] bg-[#F4F9F7] p-3 text-sm">
            <span className="font-medium text-[#1F6B67]">Em conjunto</span>
            <span className="font-semibold tabular-nums text-[#1F6B67]">{formatBRL(joint)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-[12.5px] text-muted-foreground">
        <Scale className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Dividir contas (quem deve a quem, com partes personalizadas) é uma feature à parte, ainda não ativa.
          Por ora, “gasto em conjunto” é só um marcador para separar o que foi de cada um do que foi dos dois.
        </span>
      </div>
    </div>
  );
}
