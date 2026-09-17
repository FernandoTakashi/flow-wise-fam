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
import { todayISO, formatDayMonth } from '@/lib/dates';
import { computeSplitBalances, simplifySplitDebts, equalSplitShares, exactSharesMatchTotal } from '@/core/split';
import {
  fetchSplitGroup, createSplitInvite, addSplitMember, removeSplitMember,
  createSplitExpense, updateSplitExpense, deleteSplitExpense, createSplitPayment,
  type ExpenseFormInput,
} from '@/lib/splitApi';
import type { SplitGroupDetail as SplitGroupDetailType, SplitExpense, SplitMember } from '@/types/split';
import { Plus, UserPlus, Link2, Trash2, Pencil, ArrowRightLeft, Users } from 'lucide-react';

export default function SplitGroupDetail({ session }: { session: Session | null }) {
  const { groupId } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState<SplitGroupDetailType | null>(null);
  const [tab, setTab] = useState<'despesas' | 'saldo'>('despesas');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showExpense, setShowExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SplitExpense | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const load = async () => {
    if (!groupId) return;
    try { setData(await fetchSplitGroup(groupId)); }
    catch (err) { setLoadError((err as Error).message); }
  };

  useEffect(() => { if (session) void load(); }, [session, groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMembers = useMemo(() => (data ? data.members.filter((m) => !m.leftAt) : []), [data]);
  const memberName = (id: string) => data?.members.find((m) => m.id === id)?.displayName ?? '—';

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

  const addMember = async () => {
    if (!newMemberName.trim()) return;
    setAddingMember(true);
    try {
      await addSplitMember(data.group.id, newMemberName.trim());
      setNewMemberName('');
      await load();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setAddingMember(false); }
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
                  <button type="button" className="ml-1.5 text-muted-foreground hover:text-destructive"
                    onClick={() => void kickMember(m.id)} aria-label={`Remover ${m.displayName}`}>×</button>
                )}
              </Badge>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={openInvite}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Convidar</Button>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-[12px] border border-border bg-card p-2">
        <Input value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)}
          placeholder="Adicionar alguém pelo nome (sem precisar de conta)" className="h-9 border-0 shadow-none focus-visible:ring-0"
          onKeyDown={(e) => e.key === 'Enter' && void addMember()} />
        <Button size="sm" variant="ghost" disabled={addingMember || !newMemberName.trim()} onClick={() => void addMember()}>
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-4 flex gap-2">
        <Button variant={tab === 'despesas' ? 'default' : 'outline'} size="sm" onClick={() => setTab('despesas')}>Despesas</Button>
        <Button variant={tab === 'saldo' ? 'default' : 'outline'} size="sm" onClick={() => setTab('saldo')}>Saldo</Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPayment(true)}>
            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" /> Registrar acerto
          </Button>
          <Button size="sm" onClick={() => { setEditingExpense(null); setShowExpense(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova despesa
          </Button>
        </div>
      </div>

      {tab === 'despesas' ? (
        data.expenses.length === 0 ? (
          <div className="rounded-[16px] border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma despesa lançada ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {data.expenses.map((e) => {
              const canEdit = e.createdBy === session.user.id || isOwner;
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-card p-3.5">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{e.description}</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {formatDayMonth(e.date)} · pago por {memberName(e.paidBy)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-bold tabular-nums">{formatBRL(e.amountCents)}</span>
                    {canEdit && (
                      <>
                        <button type="button" className="rounded p-1 text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingExpense(e); setShowExpense(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <ConfirmDialog title="Excluir despesa?" confirmLabel="Excluir" onConfirm={() => removeExpense(e.id)}
                          trigger={<button type="button" className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
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
        onSaved={async () => { setShowPayment(false); await load(); }}
      />

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Convidar pro grupo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Quem abrir esse link entra como visitante (só digita um nome) ou já logado, se tiver conta.
            Cole esse mesmo link/token com <code className="rounded bg-muted px-1 py-0.5 text-[12px]">/conectar</code> num grupo do Telegram pra ligar o grupo lá também.
          </p>
          {inviteLink ? (
            <div className="flex gap-2">
              <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[12.5px]" />
              <Button onClick={() => { void navigator.clipboard?.writeText(inviteLink); toast({ title: 'Link copiado' }); }}>Copiar</Button>
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? 'Editar despesa' : 'Nova despesa'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Jantar, Uber, Airbnb" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <MoneyInput valueCents={amountCents} onChangeCents={setAmountCents} />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Quem pagou</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Participantes</Label>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <label key={m.id}
                  className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[13px] has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10">
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
function PaymentDialog({
  open, onClose, groupId, members, onSaved,
}: { open: boolean; onClose: () => void; groupId: string; members: SplitMember[]; onSaved: () => void }) {
  const { toast } = useToast();
  const [fromMember, setFromMember] = useState('');
  const [toMember, setToMember] = useState('');
  const [amountCents, setAmountCents] = useState(0);
  const [dateISO, setDateISO] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!fromMember || !toMember || fromMember === toMember || amountCents <= 0) {
      toast({ title: 'Escolha duas pessoas diferentes e um valor', variant: 'destructive' }); return;
    }
    setBusy(true);
    try {
      await createSplitPayment(groupId, fromMember, toMember, amountCents, dateISO);
      setFromMember(''); setToMember(''); setAmountCents(0);
      onSaved();
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Registrar acerto</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quem pagou</Label>
              <Select value={fromMember} onValueChange={setFromMember}>
                <SelectTrigger><SelectValue placeholder="De" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pra quem</Label>
              <Select value={toMember} onValueChange={setToMember}>
                <SelectTrigger><SelectValue placeholder="Pra" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Valor</Label><MoneyInput valueCents={amountCents} onChangeCents={setAmountCents} /></div>
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
