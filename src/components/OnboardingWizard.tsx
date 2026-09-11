// Assistente pós-cadastro: aparece uma vez (por pessoa) até `wizardDone`.
// Dono da carteira vê os passos de configuração; quem foi convidado vê uma
// versão curta (boas-vindas + bot). Progresso fica em `profiles.onboarding`.
import { useMemo, useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { TelegramIntegration } from '@/components/TelegramIntegration';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/MoneyInput';
import { useToast } from '@/hooks/use-toast';
import { PartyPopper, Wallet as WalletIcon, UserPlus, Send, Sparkles } from 'lucide-react';

type StepId = 'welcome' | 'wallet' | 'invite' | 'bot' | 'done';

export function OnboardingWizard() {
  const {
    loading, profile, wallet, role, accounts, renameWallet, updateAccount, addMemberByEmail, updateOnboarding,
  } = useFinance();
  const { toast } = useToast();

  const isOwner = role === 'owner';
  const steps: StepId[] = useMemo(
    () => (isOwner ? ['welcome', 'wallet', 'invite', 'bot', 'done'] : ['welcome', 'bot', 'done']),
    [isOwner],
  );

  const [open, setOpen] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const [walletName, setWalletName] = useState('');
  const [accName, setAccName] = useState('');
  const [accBalance, setAccBalance] = useState(0);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSkipped, setInviteSkipped] = useState(false);

  const primaryAccount = accounts.find((a) => a.kind === 'cash') ?? accounts[0] ?? null;

  // primeiro load de valores default quando a etapa é alcançada
  const onWalletStepEnter = () => {
    if (!walletName && wallet) setWalletName(wallet.name);
    if (!accName && primaryAccount) { setAccName(primaryAccount.name); setAccBalance(primaryAccount.openingBalanceCents); }
  };

  const shouldShow = !loading && !!profile && !profile.onboarding?.wizardDone && !!wallet;
  if (!shouldShow || !open) return null;

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  const finish = async () => {
    setBusy(true);
    try { await updateOnboarding({ wizardDone: true }); } catch { /* não trava o fechamento por isso */ }
    finally { setBusy(false); setOpen(false); }
  };

  const goNext = async () => {
    if (step === 'wallet') {
      setBusy(true);
      try {
        if (wallet && walletName.trim() && walletName.trim() !== wallet.name) await renameWallet(wallet.id, walletName.trim());
        if (primaryAccount && (accName.trim() !== primaryAccount.name || accBalance !== primaryAccount.openingBalanceCents)) {
          await updateAccount(primaryAccount.id, { name: accName.trim() || primaryAccount.name, openingBalanceCents: accBalance });
        }
      } catch (err) {
        toast({ title: 'Não consegui salvar', description: (err as Error).message, variant: 'destructive' });
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (step === 'invite' && inviteEmail.trim() && !inviteSkipped) {
      setBusy(true);
      try {
        await addMemberByEmail(inviteEmail.trim());
        toast({ title: 'Convite enviado', description: `${inviteEmail.trim()} já pode entrar na carteira.` });
      } catch (err) {
        toast({ title: 'Não consegui convidar', description: (err as Error).message, variant: 'destructive' });
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (isLast) { void finish(); return; }
    const next = stepIdx + 1;
    setStepIdx(next);
    if (steps[next] === 'wallet') onWalletStepEnter();
  };

  const goBack = () => setStepIdx((i) => Math.max(0, i - 1));

  return (
    <Dialog open onOpenChange={(v) => { if (!v) void finish(); }}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <div className="mb-1 flex items-center gap-1.5">
          {steps.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {step === 'welcome' && (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <DialogTitle>Bem-vindo(a) ao CaRe Wallet</DialogTitle>
              <DialogDescription>
                {isOwner
                  ? `Vamos deixar a carteira "${wallet?.name}" pronta em menos de um minuto.`
                  : `Você foi adicionado(a) à carteira "${wallet?.name}". Alguns minutos pra você se situar.`}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              São só {steps.length - 1} passinhos rápidos — dá pra pular qualquer um e ajustar depois em Ajustes.
            </p>
          </>
        )}

        {step === 'wallet' && (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <WalletIcon className="h-5 w-5" />
              </div>
              <DialogTitle>Sua carteira</DialogTitle>
              <DialogDescription>Dê um nome à carteira e confirme o saldo da sua conta principal.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome da carteira</Label>
                <Input value={walletName} onChange={(e) => setWalletName(e.target.value)} placeholder="Minha Carteira" />
              </div>
              {primaryAccount && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Conta principal</Label>
                    <Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="Carteira" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Saldo atual</Label>
                    <MoneyInput valueCents={accBalance} onChangeCents={setAccBalance} />
                  </div>
                </div>
              )}
              <p className="text-[11.5px] text-muted-foreground">
                Cartão de crédito e outras contas você adiciona depois, em Ajustes → Contas.
              </p>
            </div>
          </>
        )}

        {step === 'invite' && (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserPlus className="h-5 w-5" />
              </div>
              <DialogTitle>Convide quem divide as contas com você</DialogTitle>
              <DialogDescription>Opcional — a pessoa precisa já ter uma conta no CaRe Wallet.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteSkipped(false); }}
                placeholder="parceiro@email.com" />
            </div>
          </>
        )}

        {step === 'bot' && (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Send className="h-5 w-5" />
              </div>
              <DialogTitle>Lance gastos pelo Telegram</DialogTitle>
              <DialogDescription>Opcional — dá pra conectar a qualquer momento em Ajustes → Integrações.</DialogDescription>
            </DialogHeader>
            <TelegramIntegration />
          </>
        )}

        {step === 'done' && (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <PartyPopper className="h-5 w-5" />
              </div>
              <DialogTitle>Tudo pronto</DialogTitle>
              <DialogDescription>
                Sua carteira está configurada. Ao longo das primeiras telas você vai ver dicas rápidas do que cada uma faz.
              </DialogDescription>
            </DialogHeader>
          </>
        )}

        <DialogFooter className="mt-2 flex items-center justify-between gap-2 sm:justify-between">
          <div>
            {stepIdx > 0 && !isLast && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={goBack}>Voltar</Button>
            )}
          </div>
          <div className="flex gap-2">
            {(step === 'invite') && (
              <Button type="button" variant="outline" size="sm" disabled={busy}
                onClick={() => { setInviteSkipped(true); setInviteEmail(''); void goNext(); }}>
                Pular
              </Button>
            )}
            {step === 'bot' && (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={goNext}>Pular</Button>
            )}
            <Button type="button" size="sm" disabled={busy} onClick={goNext}>
              {isLast ? 'Ir para o Dashboard' : step === 'wallet' ? 'Salvar e continuar' : step === 'invite' && inviteEmail.trim() ? 'Convidar e continuar' : 'Continuar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
