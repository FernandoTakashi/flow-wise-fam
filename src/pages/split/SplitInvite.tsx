import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { SplitShell } from '@/components/split/SplitShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { fetchInvitePreview, redeemSplitInvite } from '@/lib/splitApi';

export default function SplitInvite({ session }: { session: Session | null }) {
  const { inviteId } = useParams();
  const { toast } = useToast();
  const [preview, setPreview] = useState<{ groupName: string } | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inviteId) return;
    void fetchInvitePreview(inviteId).then(setPreview);
  }, [inviteId]);

  const isRealUser = !!session && !session.user.is_anonymous;

  const join = async () => {
    if (!inviteId) return;
    setBusy(true);
    try {
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      const groupId = await redeemSplitInvite(inviteId, name.trim() || undefined);
      window.location.href = `/dividir/${groupId}`;
    } catch (err) {
      toast({ title: 'Não consegui entrar no grupo', description: (err as Error).message, variant: 'destructive' });
      setBusy(false);
    }
  };

  if (preview === undefined) {
    return <SplitShell isGuest><div className="h-40 animate-pulse rounded-[16px] bg-muted" /></SplitShell>;
  }
  if (preview === null) {
    return (
      <SplitShell isGuest>
        <div className="mx-auto max-w-sm rounded-[16px] border border-dashed p-8 text-center text-sm text-muted-foreground">
          Esse link de convite não é válido ou foi desativado.
        </div>
      </SplitShell>
    );
  }

  return (
    <SplitShell isGuest>
      <div className="mx-auto max-w-sm rounded-[18px] border border-border bg-card p-6 text-center">
        <p className="text-[13px] text-muted-foreground">Você foi convidado pro grupo</p>
        <h1 className="mt-1 font-display text-[22px] font-bold">{preview.groupName}</h1>

        {isRealUser ? (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Entrar como <strong className="text-foreground">{session?.user.email}</strong>?
            </p>
            <Button className="mt-4 w-full" onClick={join} disabled={busy}>{busy ? 'Entrando…' : 'Entrar no grupo'}</Button>
          </>
        ) : (
          <>
            <div className="mt-5 space-y-1.5 text-left">
              <Label>Seu nome</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Como quer aparecer pro grupo" onKeyDown={(e) => e.key === 'Enter' && join()} />
            </div>
            <Button className="mt-4 w-full" onClick={join} disabled={busy || !name.trim()}>
              {busy ? 'Entrando…' : 'Entrar no grupo'}
            </Button>
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              Você entra como visitante, sem precisar criar conta — guarde este link, é como você volta a acessar o grupo depois.
            </p>
          </>
        )}
      </div>
    </SplitShell>
  );
}
