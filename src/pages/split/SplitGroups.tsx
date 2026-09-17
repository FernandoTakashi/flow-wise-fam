import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { SplitShell } from '@/components/split/SplitShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBRL } from '@/lib/money';
import { fetchSplitGroups, createSplitGroup } from '@/lib/splitApi';
import type { SplitGroupSummary } from '@/types/split';
import { Plus, Users } from 'lucide-react';

export default function SplitGroups({ session }: { session: Session | null }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<SplitGroupSummary[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetchSplitGroups()
      .then(setGroups)
      .catch((err) => toast({ title: 'Erro ao carregar grupos', description: (err as Error).message, variant: 'destructive' }));
  }, [session, toast]);

  if (!session) {
    return (
      <SplitShell isGuest>
        <div className="rounded-[16px] border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">Entre na sua conta pra ver e criar seus grupos.</p>
          <Button className="mt-4" onClick={() => { window.location.href = '/'; }}>Entrar</Button>
        </div>
      </SplitShell>
    );
  }

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await createSplitGroup(name.trim());
      window.location.href = `/dividir/${id}`;
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
      setBusy(false);
    }
  };

  return (
    <SplitShell>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-[22px] font-bold">Meus grupos</h1>
        <Button onClick={() => setShowNew(true)}><Plus className="mr-2 h-4 w-4" /> Novo grupo</Button>
      </div>

      {groups === null ? (
        <div className="h-32 animate-pulse rounded-[16px] bg-muted" />
      ) : groups.length === 0 ? (
        <div className="rounded-[16px] border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum grupo ainda. Crie um pra dividir a próxima viagem ou conta da casa.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <Link key={g.id} to={`/dividir/${g.id}`}
              className="flex items-center justify-between rounded-[14px] border border-border bg-card p-4 transition-colors hover:bg-muted/40">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {g.name}
                    {g.archived && <span className="ml-2 text-[11px] font-normal text-muted-foreground">arquivado</span>}
                  </div>
                  <div className="text-[12.5px] text-muted-foreground">{g.memberCount} pessoa{g.memberCount !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div className={`shrink-0 pl-3 text-right text-sm font-bold tabular-nums ${
                g.netCents > 0 ? 'text-emerald-600' : g.netCents < 0 ? 'text-red-600' : 'text-muted-foreground'
              }`}>
                {g.netCents === 0 ? 'quite' : `${g.netCents > 0 ? '+' : ''}${formatBRL(g.netCents)}`}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Novo grupo</DialogTitle></DialogHeader>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Viagem Floripa" onKeyDown={(e) => e.key === 'Enter' && create()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={create} disabled={busy || !name.trim()}>{busy ? 'Criando…' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SplitShell>
  );
}
