import { useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader, EmptyState } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { formatFullDate } from '@/lib/dates';
import { Scale, ArrowRight } from 'lucide-react';

export default function Settlement() {
  const {
    loading, transactions, members, memberName, categoryName,
    memberBalances, settlements,
  } = useFinance();

  const balances = useMemo(() => memberBalances(), [memberBalances]);
  const plan = useMemo(() => settlements(), [settlements]);
  const shared = useMemo(
    () => transactions
      .filter((t) => t.kind === 'expense' && t.splits.length > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions],
  );

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;

  if (members.length < 2) {
    return (
      <div className="space-y-5">
        <PageHeader title="Acerto de contas" subtitle="Divisão de despesas entre membros" />
        <EmptyState icon={<Scale className="h-10 w-10" />} title="Carteira com um único membro"
          hint="Convide alguém em Ajustes › Membros para dividir despesas." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Acerto de contas" subtitle="Divisão de despesas entre membros" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Saldo por membro</CardTitle></CardHeader>
          <CardContent className="space-y-2 p-4 pt-2">
            {balances.map((b) => (
              <div key={b.memberId} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span className="font-medium">{memberName(b.memberId)}</span>
                <span className={b.netCents > 0 ? 'font-semibold text-emerald-600' : b.netCents < 0 ? 'font-semibold text-red-600' : 'text-muted-foreground'}>
                  {b.netCents === 0 ? 'quite' : b.netCents > 0 ? `recebe ${formatBRL(b.netCents)}` : `deve ${formatBRL(-b.netCents)}`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Como acertar</CardTitle></CardHeader>
          <CardContent className="space-y-2 p-4 pt-2">
            {plan.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Ninguém deve nada.</p>
            ) : plan.map((s, i) => (
              <div key={i} className="flex items-center justify-center gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                <span className="font-medium">{memberName(s.fromId)}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{memberName(s.toId)}</span>
                <span className="ml-2 font-semibold tabular-nums text-primary">{formatBRL(s.amountCents)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Despesas divididas ({shared.length})</CardTitle></CardHeader>
        <CardContent className="p-4 pt-2">
          {shared.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Marque "Dividir entre membros" ao lançar uma despesa para ela aparecer aqui.
            </p>
          ) : (
            <div className="space-y-2">
              {shared.map((t) => (
                <div key={t.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.description || categoryName(t.categoryId)}</span>
                    <span className="font-semibold tabular-nums">{formatBRL(t.amountCents)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatFullDate(t.date)} · pago por {memberName(t.memberId)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.splits.map((s) => (
                      <span key={s.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                        {memberName(s.memberId).split(' ')[0]}: {formatBRL(s.shareCents)}
                      </span>
                    ))}
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
