import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { SplitShell } from '@/components/split/SplitShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchInvitePreview, fetchSplitGroup, redeemSplitInvite } from '@/lib/splitApi';

export default function SplitInvite({ session }: { session: Session | null }) {
  const { inviteId } = useParams();
  const { toast } = useToast();
  const [preview, setPreview] = useState<{ groupId: string; groupName: string } | null | undefined>(undefined);
  const [checkingMembership, setCheckingMembership] = useState(true);
  const [busy, setBusy] = useState(false);

  // Se a sessão atual já é membro desse grupo, pula a tela de entrada —
  // sem isso, reabrir o mesmo link sempre pedia pra "entrar" de novo, mesmo
  // já estando dentro.
  useEffect(() => {
    if (!inviteId) return;
    let cancelled = false;
    (async () => {
      const p = await fetchInvitePreview(inviteId);
      if (cancelled) return;
      setPreview(p);
      if (p && session) {
        try {
          await fetchSplitGroup(p.groupId);
          if (!cancelled) { window.location.href = `/dividir/${p.groupId}`; return; }
        } catch { /* ainda não é membro — segue pro fluxo normal de entrada */ }
      }
      if (!cancelled) setCheckingMembership(false);
    })();
    return () => { cancelled = true; };
  }, [inviteId, session]);

  const isRealUser = !!session && !session.user.is_anonymous;

  const join = async () => {
    if (!inviteId) return;
    setBusy(true);
    try {
      const groupId = await redeemSplitInvite(inviteId);
      window.location.href = `/dividir/${groupId}`;
    } catch (err) {
      toast({ title: 'Não consegui entrar no grupo', description: (err as Error).message, variant: 'destructive' });
      setBusy(false);
    }
  };

  // "Entrar"/"Criar conta" saem pro fluxo de autenticação normal do app —
  // o convite viaja junto na própria URL (não em localStorage) pra
  // sobreviver a confirmação de e-mail em outra aba/dispositivo. App.tsx e
  // Auth.tsx cuidam de voltar pra cá assim que a sessão de verdade aparecer.
  const goToAuth = (mode: 'login' | 'register') => {
    window.location.href = `/?mode=${mode}&invite=${inviteId}`;
  };

  if (preview === undefined || checkingMembership) {
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
    <SplitShell isGuest={!isRealUser}>
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
            <p className="mt-4 text-sm text-muted-foreground">
              Pra entrar nesse grupo você precisa de uma conta no CaRe Wallet — é rápido e o convite te traz de volta pra cá.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button size="lg" className="h-12 w-full text-[15px]" onClick={() => goToAuth('login')}>
                Já tenho conta no CaRe Wallet
              </Button>
              <Button variant="outline" size="lg" className="h-11 w-full text-[14.5px]" onClick={() => goToAuth('register')}>
                Criar uma conta
              </Button>
            </div>
          </>
        )}
      </div>
    </SplitShell>
  );
}
