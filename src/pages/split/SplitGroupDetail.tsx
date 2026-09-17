import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { SplitShell } from '@/components/split/SplitShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { MoneyInput } from '@/components/MoneyInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBRL } from '@/lib/money';
import { todayISO, formatDayMonth, isoParts, MONTHS_PT } from '@/lib/dates';
import { cn, SHEET_DIALOG_CLASS } from '@/lib/utils';
import { computeSplitBalances, simplifySplitDebts, equalSplitShares, exactSharesMatchTotal, type SplitSettlement } from '@/core/split';
import {
  fetchSplitGroup, createSplitInvite, removeSplitMember,
  createSplitExpense, updateSplitExpense, deleteSplitExpense, createSplitPayment, deleteSplitPayment,
  type ExpenseFormInput,
} from '@/lib/splitApi';
import type { SplitGroupDetail as SplitGroupDetailType, SplitExpense, SplitPayment, SplitMember } from '@/types/split';
import { Plus, Link2, Trash2, Pencil, ArrowRightLeft, Receipt } from 'lucide-react';

type ActivityItem =
  | { kind: 'expense'; date: string; createdAt: string; expense: SplitExpense }
  | { kind: 'payment'; date: string; createdAt: string; payment: SplitPayment };

export default function SplitGroupDetail({ session }: { session: Session | null }) {
  const { groupId } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState<SplitGroupDetailType | null>(null);
  const [tab, setTab] = useState<'atividade' | 'saldo'>('atividade');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showExpense, setShowExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SplitExpense | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const load = async () => {
    if (!groupId) return;
    try { setData(await fetchSplitGroup(groupId)); }
    catch (err) { setLoadError((err as Error).message); }
  };

  useEffect(() => { if (session) void load(); }, [session, groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMembers = useMemo(() => (data ? data.members.filter((m) => !m.leftAt) : []), [data]);
  const memberName = (id: string) => data?.members.find((m) => m.id === id)?.displayName ?? '—';
  const myMemberId = useMemo(
    () => (data && session ? data.members.find((m) => m.userId === session.user.id)?.id ?? null : null),
    [data, session],
  );

  // feed único (despesas + acertos), mais recente primeiro, agrupado por mês
  const activity = useMemo<ActivityItem[]>(() => {
    if (!data) return [];
    const items: ActivityItem[] = [
      ...data.expenses.map((expense) => ({ kind: 'expense' as const, date: expense.date, createdAt: expense.createdAt, expense })),
      ...data.payments.map((payment) => ({ kind: 'payment' as const, date: payment.date, createdAt: payment.createdAt, payment })),
    ];
    items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return items;
  }, [data]);

  const removePayment = async (id: string) => {
    if (!data) return;
    try { await deleteSplitPayment(data.group.id, id); await load(); }
    catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
  };

  const balances = useMemo(() => {
    if (!data) return [];
    return computeSplitBalances(
      data.members.map((m) => m.id),
      data.expenses.map((e) => ({ id: e.id, paidBy: e.paidBy, amountCents: e.amountCents })),
      data.shares.map((s) => ({ expenseId: s.expenseId, memberId: s.memberId, shareCents: s.shareCents })),
      data.payments.map((p) => ({ fromMember: p.fromMember, toMember: p.toMember, amountCents: p.amountCents })),
    );
  }, [data]);
  const settlements = useMemo(() => simplifySplitDebts(balances), [balances]);

  if (!session) {
    return (
      <SplitShell isGuest>
        <div className="rounded-[16px] border border-dashed p-8 text-center text-sm text-muted-foreground">
          Esse grupo precisa de um convite pra ser acessado. Peça o link pra quem te chamou.
        </div>
      </SplitShell>
    );
  }
  if (loadError) {
    return (
      <SplitShell isGuest={session.user.is_anonymous}>
        <div className="rounded-[16px] border border-dashed p-8 text-center text-sm text-muted-foreground">
          Não consegui abrir esse grupo — {loadError}
        </div>
      </SplitShell>
    );
  }
  if (!data) {
    return <SplitShell isGuest={session.user.is_anonymous}><div className="h-40 animate-pulse rounded-[16px] bg-muted" /></SplitShell>;
  }

  const isOwner = data.group.createdBy === session.user.id;
  const isGuest = !!session.user.is_anonymous;

  const openInvite = async () => {
    setShowInvite(true);
    if (inviteLink) return;
    try {
      const id = await createSplitInvite(data.group.id);
      setInviteLink(`${window.location.origin}/dividir/convite/${id}`);
    } catch (err) {
      toast({ title: 'Erro ao gerar convite', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const kickMember = async (memberId: string) => {
    try { await removeSplitMember(data.group.id, memberId); await load(); }
    catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
  };

  const removeExpense = async (id: string) => {
    try { await deleteSplitExpense(data.group.id, id); await load(); }
    catch (err) { toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' }); }
  };

  return (
    <SplitShell isGuest={isGuest}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold">{data.group.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {activeMembers.map((m) => (
              <Badge key={m.id} variant="secondary" className="font-normal">
                {m.displayName}
                {isOwner && m.userId !== session.user.id && (
                  <button type="button" className="-mr-1 ml-1 inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-destructive"
                    onClick={() => void kickMember(m.id)} aria-label={`Remover ${m.displayName}`}>×</button>
                )}
              </Badge>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={openInvite}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Convidar</Button>
      </div>

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button variant={tab === 'atividade' ? 'default' : 'outline'} size="sm" className="flex-1 sm:flex-none" onClick={() => setTab('atividade')}>Atividade</Button>
          <Button variant={tab === 'saldo' ? 'default' : 'outline'} size="sm" className="flex-1 sm:flex-none" onClick={() => setTab('saldo')}>Saldo</Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setShowPayment(true)}>
            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" /> Acerto
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => { setEditingExpense(null); setShowExpense(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova despesa
          </Button>
        </div>
      </div>

      {tab === 'atividade' ? (
        activity.length === 0 ? (
          <div className="rounded-[16px] border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma despesa ou acerto lançado ainda.
          </div>
        ) : (
          <div className="space-y-5">
            {activity.reduce<{ monthKey: string; label: string; rows: JSX.Element[] }[]>((sections, item) => {
              const { y, m } = isoParts(item.date);
              const monthKey = `${y}-${m}`;
              let section = sections[sections.length - 1];
              if (!section || section.monthKey !== monthKey) {
                section = { monthKey, label: `${MONTHS_PT[m]} de ${y}`, rows: [] };
                sections.push(section);
              }

              if (item.kind === 'expense') {
                const e = item.expense;
                const canEdit = e.createdBy === session.user.id || isOwner;
                const myShare = myMemberId ? data.shares.find((s) => s.expenseId === e.id && s.memberId === myMemberId)?.shareCents ?? 0 : 0;
                const iPaid = myMemberId && e.paidBy === myMemberId ? e.amountCents : 0;
                const net = iPaid - myShare;
                section.rows.push(
                  <div key={e.id} className="flex items-center gap-3 border-b border-[#F4EDE7] px-1 py-3 last:border-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Receipt className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{e.description}</div>
                      <div className="text-[12.5px] text-muted-foreground">
                        {formatDayMonth(e.date)} · {e.paidBy === myMemberId ? 'você pagou' : `${memberName(e.paidBy)} pagou`} {formatBRL(e.amountCents)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {net !== 0 && (
                        <div className="text-right text-[12px] leading-tight">
                          <div className={net > 0 ? 'text-emerald-600' : 'text-red-600'}>{net > 0 ? 'você recebe' : 'você deve'}</div>
                          <div className={cn('font-bold tabular-nums', net > 0 ? 'text-emerald-600' : 'text-red-600')}>{formatBRL(Math.abs(net))}</div>
                        </div>
                      )}
                      {canEdit && (
                        <>
                          <button type="button" className="-m-1.5 rounded p-2.5 text-muted-foreground hover:text-foreground"
                            onClick={() => { setEditingExpense(e); setShowExpense(true); }} aria-label="Editar despesa">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <ConfirmDialog title="Excluir despesa?" confirmLabel="Excluir" onConfirm={() => removeExpense(e.id)}
                            trigger={<button type="button" className="-m-1.5 rounded p-2.5 text-muted-foreground hover:text-destructive" aria-label="Excluir despesa"><Trash2 className="h-3.5 w-3.5" /></button>} />
                        </>
                      )}
                    </div>
                  </div>,
                );
              } else {
                const p = item.payment;
                const canEdit = p.createdBy === session.user.id || isOwner;
                const fromLabel = p.fromMember === myMemberId ? 'Você' : memberName(p.fromMember);
                const toLabel = p.toMember === myMemberId ? 'você' : memberName(p.toMember);
                section.rows.push(
                  <div key={p.id} className="flex items-center gap-3 border-b border-[#F4EDE7] px-1 py-3 last:border-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                      <ArrowRightLeft className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px]">
                        <strong>{fromLabel}</strong> pagou <strong>{toLabel}</strong> {formatBRL(p.amountCents)}.
                      </div>
                      <div className="text-[12.5px] text-muted-foreground">{formatDayMonth(p.date)}</div>
                    </div>
                    {canEdit && (
                      <ConfirmDialog title="Excluir acerto?" confirmLabel="Excluir" onConfirm={() => removePayment(p.id)}
                        trigger={<button type="button" className="-m-1.5 shrink-0 rounded p-2.5 text-muted-foreground hover:text-destructive" aria-label="Excluir acerto"><Trash2 className="h-3.5 w-3.5" /></button>} />
                    )}
                  </div>,
                );
              }
              return sections;
            }, []).map((section) => (
              <div key={section.monthKey}>
                <div className="mb-1.5 px-1 text-[12.5px] font-bold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </div>
                <div className="rounded-[14px] border border-border bg-card px-2.5">{section.rows}</div>
              </div>
            ))}
          </div>
        )
      ) : (
        settlements.length === 0 ? (
          <div className="rounded-[16px] border border-dashed p-8 text-center text-sm text-muted-foreground">
            Ninguém deve nada — tudo quite por aqui. 🎉
          </div>
        ) : (
          <div className="space-y-2">
            {settlements.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-[14px] border border-border bg-card p-3.5">
                <span className="flex items-center gap-2 text-sm">
                  <strong>{memberName(s.fromMemberId)}</strong> deve pra <strong>{memberName(s.toMemberId)}</strong>
                </span>
                <span className="font-bold tabular-nums text-red-600">{formatBRL(s.amountCents)}</span>
              </div>
            ))}
          </div>
        )
      )}

      {showExpense && (
        <ExpenseDialog
          open={showExpense}
          onClose={() => setShowExpense(false)}
          groupId={data.group.id}
          members={activeMembers}
          editing={editingExpense}
          onSaved={async () => { setShowExpense(false); await load(); }}
        />
      )}

      <PaymentDialog
        open={showPayment}
        onClose={() => setShowPayment(false)}
        groupId={data.group.id}
        members={activeMembers}
        settlements={settlements}
        myMemberId={myMemberId}
        onSaved={async () => { setShowPayment(false); await load(); }}
      />

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className={cn('sm:max-w-md', SHEET_DIALOG_CLASS)}>
          <DialogHeader><DialogTitle>Convidar pro grupo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Quem abrir esse link entra como visitante (só digita um nome) ou já logado, se tiver conta.
            Cole esse mesmo link/token com <code className="rounded bg-muted px-1 py-0.5 text-[12px]">/conectar</code> num grupo do Telegram pra ligar o grupo lá também.
          </p>
          {inviteLink ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} className="h-11 font-mono text-[13px] sm:h-10 sm:text-[12.5px]" />
              <Button size="lg" className="h-11 sm:h-10" onClick={() => { void navigator.clipboard?.writeText(inviteLink); toast({ title: 'Link copiado' }); }}>Copiar</Button>
            </div>
          ) : (
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          )}
        </DialogContent>
      </Dialog>
    </SplitShell>
  );
}

// ---------------------------------------------------------------------------
function ExpenseDialog({
  open, onClose, groupId, members, editing, onSaved,
}: {
  open: boolean; onClose: () => void; groupId: string; members: SplitMember[];
  editing: SplitExpense | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [description, setDescription] = useState(editing?.description ?? '');
  const [amountCents, setAmountCents] = useState(editing?.amountCents ?? 0);
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? members[0]?.id ?? '');
  const [dateISO, setDateISO] = useState(editing?.date ?? todayISO());
  const [participantIds, setParticipantIds] = useState<string[]>(members.map((m) => m.id));
  const [mode, setMode] = useState<'equal' | 'exact'>('equal');
  const [exactShares, setExactShares] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const toggleParticipant = (id: string) => setParticipantIds((prev) =>
    prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);

  const equalPreview = useMemo(() => equalSplitShares(amountCents, participantIds), [amountCents, participantIds]);
  const exactSum = Object.entries(exactShares).filter(([id]) => participantIds.includes(id))
    .reduce((s, [, c]) => s + (c || 0), 0);

  const save = async () => {
    if (!description.trim() || amountCents <= 0 || !paidBy || participantIds.length === 0) {
      toast({ title: 'Preencha descrição, valor, pagador e participantes', variant: 'destructive' }); return;
    }
    const input: ExpenseFormInput = { description, amountCents, paidBy, dateISO, participantIds };
    if (mode === 'exact') {
      const shares: Record<string, number> = {};
      participantIds.forEach((id) => { shares[id] = exactShares[id] || 0; });
      if (!exactSharesMatchTotal(amountCents, shares)) {
        toast({ title: 'A soma dos valores não bate com o total', variant: 'destructive' }); return;
      }
      input.exactShareCents = shares;
    }
    setBusy(true);
    try {
      if (editing) await updateSplitExpense(groupId, editing.id, input);
      else await createSplitExpense(groupId, input);
      onSaved();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('sm:max-w-lg', SHEET_DIALOG_CLASS)}>
        <div className="mx-auto mb-1 h-[5px] w-11 shrink-0 rounded-full bg-[#DDD1C9] sm:hidden" />
        <DialogHeader><DialogTitle>{editing ? 'Editar despesa' : 'Nova despesa'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Jantar, Uber, Airbnb" className="h-11 text-[16px] sm:h-10 sm:text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <MoneyInput valueCents={amountCents} onChangeCents={setAmountCents} />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} className="h-11 text-[16px] sm:h-10 sm:text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Quem pagou</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger className="h-11 sm:h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Participantes</Label>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <label key={m.id}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-[13px] has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10">
                  <Checkbox checked={participantIds.includes(m.id)} onCheckedChange={() => toggleParticipant(m.id)} />
                  {m.displayName}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-[12px] border border-border p-3">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === 'equal' ? 'default' : 'outline'} onClick={() => setMode('equal')}>Igual pra todos</Button>
              <Button type="button" size="sm" variant={mode === 'exact' ? 'default' : 'outline'} onClick={() => setMode('exact')}>Valor exato</Button>
            </div>
            {mode === 'equal' ? (
              <p className="text-[12.5px] text-muted-foreground">
                {participantIds.map((id) => `${members.find((m) => m.id === id)?.displayName}: ${formatBRL(equalPreview[id] ?? 0)}`).join(' · ') || 'Escolha os participantes'}
              </p>
            ) : (
              <div className="space-y-2">
                {participantIds.map((id) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-[13px]">{members.find((m) => m.id === id)?.displayName}</span>
                    <MoneyInput valueCents={exactShares[id] ?? 0} onChangeCents={(c) => setExactShares((prev) => ({ ...prev, [id]: c }))} />
                  </div>
                ))}
                <p className={`text-[12px] ${exactSum === amountCents ? 'text-emerald-600' : 'text-red-600'}`}>
                  Soma: {formatBRL(exactSum)} de {formatBRL(amountCents)}
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// "Registrar acerto" no estilo settle-up: mostra direto quem você deve/te
// deve (a partir do saldo já simplificado) — sem campo de valor livre pra
// preencher. "Outro acerto" é a válvula de escape pra um caso manual
// (ex: dono do grupo acertando em nome de duas outras pessoas).
function PaymentDialog({
  open, onClose, groupId, members, settlements, myMemberId, onSaved,
}: {
  open: boolean; onClose: () => void; groupId: string; members: SplitMember[];
  settlements: SplitSettlement[]; myMemberId: string | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? '—';

  const [step, setStep] = useState<'list' | 'confirm' | 'manual'>('list');
  const [selected, setSelected] = useState<SplitSettlement | null>(null);
  const [dateISO, setDateISO] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  const [fromMember, setFromMember] = useState('');
  const [toMember, setToMember] = useState('');
  const [amountCents, setAmountCents] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep('list'); setSelected(null); setDateISO(todayISO());
    setFromMember(''); setToMember(''); setAmountCents(0);
  }, [open]);

  const mySettlements = myMemberId
    ? settlements.filter((s) => s.fromMemberId === myMemberId || s.toMemberId === myMemberId)
    : settlements;

  const confirm = async (fromM: string, toM: string, amount: number) => {
    setBusy(true);
    try {
      await createSplitPayment(groupId, fromM, toM, amount, dateISO);
      onSaved();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const saveManual = () => {
    if (!fromMember || !toMember || fromMember === toMember || amountCents <= 0) {
      toast({ title: 'Escolha duas pessoas diferentes e um valor', variant: 'destructive' }); return;
    }
    void confirm(fromMember, toMember, amountCents);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('sm:max-w-sm', SHEET_DIALOG_CLASS)}>
        <div className="mx-auto mb-1 h-[5px] w-11 shrink-0 rounded-full bg-[#DDD1C9] sm:hidden" />
        <DialogHeader><DialogTitle>Registrar acerto</DialogTitle></DialogHeader>

        {step === 'list' && (
          <div className="space-y-3">
            {mySettlements.length === 0 ? (
              <p className="rounded-[12px] border border-dashed p-4 text-center text-sm text-muted-foreground">
                Tudo quite por aqui — ninguém precisa acertar nada. 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {mySettlements.map((s, i) => {
                  const iOwe = s.fromMemberId === myMemberId;
                  const otherId = iOwe ? s.toMemberId : s.fromMemberId;
                  return (
                    <button key={i} type="button"
                      className="flex w-full items-center justify-between rounded-[12px] border border-border p-3.5 text-left hover:bg-muted/40"
                      onClick={() => { setSelected(s); setStep('confirm'); }}>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{nameOf(otherId)}</div>
                        <div className={cn('text-[12.5px]', myMemberId ? (iOwe ? 'text-red-600' : 'text-emerald-600') : 'text-muted-foreground')}>
                          {myMemberId ? (iOwe ? 'você deve' : 'deve pra você') : `${nameOf(s.fromMemberId)} deve pra ${nameOf(s.toMemberId)}`}
                        </div>
                      </div>
                      <span className="shrink-0 font-bold tabular-nums">{formatBRL(s.amountCents)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button type="button" className="text-[13px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => setStep('manual')}>
              Registrar um acerto diferente
            </button>
          </div>
        )}

        {step === 'confirm' && selected && (
          <div className="space-y-4">
            <div className="rounded-[14px] border border-border p-5 text-center">
              <p className="text-sm text-muted-foreground">Confirmar pagamento de</p>
              <p className="mt-1 text-[28px] font-bold tabular-nums">{formatBRL(selected.amountCents)}</p>
              <p className="mt-1.5 text-sm">
                <strong>{nameOf(selected.fromMemberId)}</strong> paga <strong>{nameOf(selected.toMemberId)}</strong>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} className="h-11 text-[16px] sm:h-10 sm:text-sm" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('list')}>Voltar</Button>
              <Button onClick={() => void confirm(selected.fromMemberId, selected.toMemberId, selected.amountCents)} disabled={busy}>
                {busy ? 'Registrando…' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'manual' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quem pagou</Label>
                <Select value={fromMember} onValueChange={setFromMember}>
                  <SelectTrigger className="h-11 sm:h-10"><SelectValue placeholder="De" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pra quem</Label>
                <Select value={toMember} onValueChange={setToMember}>
                  <SelectTrigger className="h-11 sm:h-10"><SelectValue placeholder="Pra" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Valor</Label><MoneyInput valueCents={amountCents} onChangeCents={setAmountCents} /></div>
              <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} className="h-11 text-[16px] sm:h-10 sm:text-sm" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('list')}>Voltar</Button>
              <Button onClick={saveManual} disabled={busy}>{busy ? 'Salvando…' : 'Registrar'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
