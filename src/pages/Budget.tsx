import { useMemo, useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { PageHeader, EmptyState } from '@/components/PageHeader';
import { OnboardingTip } from '@/components/OnboardingTip';
import { MoneyInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBRL } from '@/lib/money';
import { cn, SHEET_DIALOG_CLASS } from '@/lib/utils';
import type { CategoryBudgetRow } from '@/core';
import type { BudgetGroup } from '@/types';
import { Target, PiggyBank, Sparkles, AlertTriangle } from 'lucide-react';

export default function Budget() {
  const {
    loading, selectedMonth, budgetSummary, setCategoryBudget, clearCategoryBudget, updateCategory,
  } = useFinance();
  const { toast } = useToast();
  const { month, year } = selectedMonth;

  const b = useMemo(() => budgetSummary(month, year), [budgetSummary, month, year]);

  const [editing, setEditing] = useState<CategoryBudgetRow | null>(null);
  const [amount, setAmount] = useState(0);
  const [groupChoice, setGroupChoice] = useState<BudgetGroup | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="h-64 animate-pulse rounded-[18px] bg-muted" />;

  const openEdit = (c: CategoryBudgetRow) => {
    setEditing(c); setAmount(c.budgetCents); setGroupChoice(c.group);
  };

  const classify = async (categoryId: string, group: BudgetGroup) => {
    try {
      await updateCategory(categoryId, { budgetGroup: group });
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const saveBudget = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (!editing.fixed && groupChoice && groupChoice !== editing.group) {
        await classify(editing.categoryId, groupChoice);
      }
      if (amount > 0) await setCategoryBudget(editing.categoryId, amount);
      toast({ title: 'Orçamento salvo' });
      setEditing(null);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const resetToSuggestion = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await clearCategoryBudget(editing.categoryId);
      toast({ title: 'Voltou pra sugestão automática' });
      setEditing(null);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const unclassified = b.categories.filter((c) => c.group == null);
  const necessidade = b.categories.filter((c) => c.group === 'necessidade');
  const desejo = b.categories.filter((c) => c.group === 'desejo');

  const necessidadePct = b.fixedIncomeCents > 0 ? (b.necessidadeBudgetCents / b.fixedIncomeCents) * 100 : 0;
  const investidoPct = b.poupancaTargetCents > 0
    ? Math.min((b.investedThisMonthCents / b.poupancaTargetCents) * 100, 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Orçamento" subtitle="Método 50/30/20 sobre sua renda fixa" />

      <OnboardingTip pageKey="orcamento" title="Necessidade manda, Poupança é protegida">
        "Destinado" é quanto você separou por categoria (clique numa categoria pra ajustar). "Meta de referência" é só
        uma régua de comparação: 50% da renda fixa pra Necessidade, e o que sobra depois de cobrir Necessidade e
        Poupança (20%) pra Desejo — por isso Necessidade pode passar de 50% (fixo é fixo), e quem aperta é o Desejo,
        nunca a Poupança.
      </OnboardingTip>

      {b.fixedIncomeCents === 0 ? (
        <EmptyState icon={<Target className="h-10 w-10" />} title="Sem renda fixa cadastrada"
          hint="Cadastre uma recorrência de entrada em Gastos fixos pra eu calcular o orçamento 50/30/20." />
      ) : (
        <>
          {unclassified.length > 0 && (
            <div className="rounded-[18px] border border-[#F0C9B8] bg-[#FBEEE7] px-5 py-4">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#B35A3A]">
                <Sparkles className="h-4 w-4" />
                Classifique {unclassified.length} categoria{unclassified.length > 1 ? 's' : ''}
              </div>
              <p className="mt-1 text-[12.5px] text-[#8A6A57]">
                Sem recorrência fixa vinculada — diga se cada uma é Necessidade (essencial, ex: combustível)
                ou Desejo (dá pra cortar num aperto).
              </p>
              <div className="mt-3 space-y-2">
                {unclassified.map((c) => (
                  <div key={c.categoryId} className="flex items-center justify-between gap-2 rounded-[12px] bg-card px-3 py-2">
                    <span className="truncate text-[13px] font-semibold text-foreground">{c.name}</span>
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11.5px]"
                        onClick={() => classify(c.categoryId, 'necessidade')}>Necessidade</Button>
                      <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11.5px]"
                        onClick={() => classify(c.categoryId, 'desejo')}>Desejo</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3.5 md:grid-cols-3">
            <GroupCard
              label="Necessidade" pctLabel="meta 50%" color="#2F8F8A"
              referenceLabel="50% da renda fixa" targetCents={b.fixedIncomeCents * 0.5}
              budgetCents={b.necessidadeBudgetCents} spentCents={b.necessidadeSpentCents}
              overTarget={necessidadePct > 50}
            />
            <GroupCard
              label="Desejo" pctLabel="o que sobra" color="#C8862F"
              referenceLabel="Disponível após Necessidade + Poupança" targetCents={b.desejoTargetCents}
              budgetCents={b.desejoBudgetCents} spentCents={b.desejoSpentCents}
              overTarget={b.desejoBudgetCents > b.desejoTargetCents}
            />
            <div className="rounded-[18px] border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-[#7E6E66]">
                <PiggyBank className="h-3.5 w-3.5" /> Poupança · meta 20%
              </div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular-nums text-foreground">
                {formatBRL(b.poupancaTargetCents)}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F1E8E1]">
                <div className="h-full rounded-full bg-[#1F7A52]" style={{ width: `${investidoPct}%` }} />
              </div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                Investido esse mês: <strong className="text-foreground">{formatBRL(b.investedThisMonthCents)}</strong>
              </div>
            </div>
          </div>

          {b.desejoSqueezed && (
            <div className="flex items-start gap-2.5 rounded-[14px] border border-[#F0C9B8] bg-[#FBEEE7] px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B35A3A]" />
              <p className="text-[12.5px] leading-snug text-[#8A6A57]">
                Seus fixos comprometem {necessidadePct.toFixed(0)}% da renda fixa — não sobra orçamento de Desejo
                esse mês, e a meta de Poupança de 20% ({formatBRL(b.poupancaTargetCents)}) está em risco.
              </p>
            </div>
          )}

          <div className="grid gap-3.5 md:grid-cols-2">
            <CategoryList title="Necessidade" rows={necessidade} onEdit={openEdit} />
            <CategoryList title="Desejo" rows={desejo} onEdit={openEdit} />
          </div>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className={cn('sm:max-w-sm', SHEET_DIALOG_CLASS)}>
          <DialogHeader><DialogTitle>{editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {editing?.fixed ? (
              <p className="text-[12px] text-muted-foreground">
                Tem recorrência fixa vinculada — conta como Necessidade automaticamente.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label>Grupo</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="flex-1"
                    variant={groupChoice === 'necessidade' ? 'default' : 'outline'}
                    onClick={() => setGroupChoice('necessidade')}>Necessidade</Button>
                  <Button type="button" size="sm" className="flex-1"
                    variant={groupChoice === 'desejo' ? 'default' : 'outline'}
                    onClick={() => setGroupChoice('desejo')}>Desejo</Button>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Valor destinado</Label>
              <MoneyInput valueCents={amount} onChangeCents={setAmount} />
              {editing && (
                <p className="text-[11.5px] text-muted-foreground">
                  Sugestão automática (média dos últimos 3 meses): {formatBRL(editing.suggestedCents)}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="ghost" className="sm:mr-auto" onClick={resetToSuggestion} disabled={busy}>
              Usar sugestão
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="button" onClick={saveBudget} disabled={busy || amount <= 0}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupCard({ label, pctLabel, color, referenceLabel, targetCents, budgetCents, spentCents, overTarget }: {
  label: string; pctLabel: string; color: string; referenceLabel: string;
  targetCents: number; budgetCents: number; spentCents: number; overTarget: boolean;
}) {
  const pct = budgetCents > 0 ? Math.min((spentCents / budgetCents) * 100, 100) : 0;
  return (
    <div className="rounded-[18px] border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between text-[11.5px] font-bold uppercase tracking-wide text-[#7E6E66]">
        <span>{label} · {pctLabel}</span>
        {overTarget && <span className="text-[#C8452F]">acima da meta</span>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-display text-[22px] font-bold tabular-nums text-foreground">{formatBRL(budgetCents)}</span>
        <span className="text-[12px] text-muted-foreground">destinado</span>
      </div>
      <div className="text-[11.5px] text-muted-foreground">{referenceLabel}: {formatBRL(targetCents)}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F1E8E1]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">
        Gasto esse mês: <strong className="text-foreground">{formatBRL(spentCents)}</strong>
      </div>
    </div>
  );
}

function CategoryList({ title, rows, onEdit }: {
  title: string; rows: CategoryBudgetRow[]; onEdit: (c: CategoryBudgetRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card">
      <div className="border-b border-border px-5 py-3 text-[12.5px] font-bold uppercase tracking-wide text-[#7E6E66]">
        {title}
      </div>
      <div className="divide-y divide-[#F4EDE7]">
        {rows.map((c) => {
          const pct = c.budgetCents > 0 ? Math.min((c.spentCents / c.budgetCents) * 100, 100) : 0;
          const over = c.spentCents > c.budgetCents;
          return (
            <button key={c.categoryId} type="button" onClick={() => onEdit(c)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[#FDFAF8]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-semibold text-foreground">{c.name}</span>
                  {c.fixed && (
                    <span className="shrink-0 rounded-full bg-[#F4EDE7] px-1.5 py-[1px] text-[10px] font-bold uppercase text-[#7E6E66]">
                      fixo
                    </span>
                  )}
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#F1E8E1]">
                  <div className={cn('h-full rounded-full', over ? 'bg-[#C8452F]' : 'bg-primary')} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="shrink-0 text-right text-[13px] tabular-nums">
                <div className={cn('font-bold', over ? 'text-[#C8452F]' : 'text-foreground')}>{formatBRL(c.spentCents)}</div>
                <div className="text-[11px] text-muted-foreground">de {formatBRL(c.budgetCents)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
