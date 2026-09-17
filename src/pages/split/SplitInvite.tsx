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
import { savePendingInvite } from '@/lib/pendingInvite';

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

  // "Entrar"/"Criar conta" saem pro fluxo de autenticação normal do app —
  // guarda o convite pra voltar direto pra cá assim que a sessão de verdade
  // aparecer (App.tsx cuida do redirecionamento).
  const goToAuth = (mode: 'login' | 'register') => {
    if (inviteId) savePendingInvite(inviteId);
    window.location.href = mode === 'register' ? '/?mode=register' : '/';
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
        <h1 className="mt-1 font-display text-[22px] font-bold text-balance">{preview.groupName}</h1>

        {isRealUser ? (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Entrar como <strong className="text-foreground">{session?.user.email}</strong>?
            </p>
            <Button size="lg" className="mt-4 h-12 w-full text-[15px]" onClick={join} disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar no grupo'}
            </Button>
          </>
        ) : (
          <>
            <div className="mt-5 space-y-1.5 text-left">
              <Label>Seu nome</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Como quer aparecer pro grupo" className="h-12 text-[16px]"
                onKeyDown={(e) => e.key === 'Enter' && join()} />
            </div>
            <Button size="lg" className="mt-3 h-12 w-full text-[15px]" onClick={join} disabled={busy || !name.trim()}>
              {busy ? 'Entrando…' : 'Continuar como visitante'}
            </Button>
            <p className="mt-2.5 text-[11.5px] text-muted-foreground">
              Sem precisar criar conta — guarde este link, é como você volta a acessar o grupo depois.
            </p>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex flex-col gap-2">
              <Button variant="outline" size="lg" className="h-11 w-full text-[14.5px]" disabled={busy}
                onClick={() => goToAuth('login')}>
                Já tenho conta no CaRe Wallet
              </Button>
              <Button variant="ghost" size="lg" className="h-11 w-full text-[14.5px] text-muted-foreground" disabled={busy}
                onClick={() => goToAuth('register')}>
                Criar uma conta
              </Button>
            </div>
          </>
        )}
      </div>
    </SplitShell>
  );
}
