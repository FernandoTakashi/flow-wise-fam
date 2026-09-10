import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mapAuthError } from '@/lib/authErrors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, MailCheck } from 'lucide-react';
import { Mascot } from '@/components/Mascot';

const FIELD = 'h-[52px] rounded-[14px] border-[#E2D7CF] bg-white text-[15px]';
const LABEL = 'text-[12.5px] font-semibold text-[#5C4C45]';
const REDIRECT = typeof window !== 'undefined' ? window.location.origin : undefined;

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resending, setResending] = useState(false);
  /** null = formulário; 'confirm' = "confirme seu e-mail"; 'reset' = "link de senha enviado" */
  const [sent, setSent] = useState<null | 'confirm' | 'reset'>(null);
  const isRegister = mode === 'register';

  const fail = (title: string, err: unknown) =>
    toast({ title, description: mapAuthError(err as { message?: string }), variant: 'destructive' });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) fail('Não foi possível entrar', error);
      // sucesso: o App troca de tela pelo onAuthStateChange
    } catch (err) {
      fail('Não foi possível entrar', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast({ title: 'Senha muito curta', description: 'Use pelo menos 8 caracteres.', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: REDIRECT },
      });
      if (error) { fail('Não foi possível criar a conta', error); return; }

      // Supabase devolve um "usuário" sem identities quando o e-mail JÁ existe
      // (evita enumeração de e-mails). Trata como conta já cadastrada.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        toast({
          title: 'E-mail já cadastrado',
          description: 'Já existe uma conta com esse e-mail. Entre ou recupere a senha.',
          variant: 'destructive',
        });
        setMode('login');
        return;
      }

      if (data.session) {
        toast({ title: 'Conta criada!', description: 'Bem-vindo à CaRe Wallet.' });
        // App troca de tela sozinho
      } else {
        // confirmação de e-mail ligada: sem sessão até confirmar
        setSent('confirm');
      }
    } catch (err) {
      fail('Não foi possível criar a conta', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      toast({ title: 'Informe o e-mail', description: 'Preencha o campo de e-mail primeiro.', variant: 'destructive' });
      return;
    }
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: REDIRECT });
      if (error) fail('Erro ao enviar o link', error);
      else setSent('reset');
    } catch (err) {
      fail('Erro ao enviar o link', err);
    } finally {
      setResetting(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: REDIRECT },
      });
      toast(error
        ? { title: 'Erro ao reenviar', description: mapAuthError(error), variant: 'destructive' }
        : { title: 'E-mail reenviado', description: 'Confira também a caixa de spam.' });
    } finally {
      setResending(false);
    }
  };

  // ---- tela de "e-mail enviado" -------------------------------------------
  if (sent) {
    const isConfirm = sent === 'confirm';
    return (
      <div className="flex min-h-screen flex-col justify-center bg-background px-[26px] pb-10 pt-8">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#E7F2F1] text-accent">
            <MailCheck className="h-7 w-7" />
          </div>
          <div>
            <h1 className="font-display text-[24px] font-bold text-foreground">
              {isConfirm ? 'Confirme seu e-mail' : 'Link enviado'}
            </h1>
            <p className="mt-2 text-[14px] leading-[1.5] text-[#5C4C45]">
              {isConfirm
                ? <>Enviamos um link de confirmação para <strong>{email}</strong>. Abra e confirme para entrar.</>
                : <>Enviamos um link para redefinir a senha para <strong>{email}</strong>.</>}
              {' '}Confira também a caixa de spam.
            </p>
          </div>
          {isConfirm && (
            <Button variant="outline" className="h-[46px] rounded-[14px]" disabled={resending} onClick={handleResend}>
              {resending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reenviando…</> : 'Reenviar e-mail'}
            </Button>
          )}
          <button type="button" onClick={() => { setSent(null); setMode('login'); }}
            className="text-[13.5px] font-semibold text-accent hover:underline">
            Voltar para o login
          </button>
        </div>
      </div>
    );
  }

  // ---- formulário -------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-[26px] pb-10 pt-8">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-[26px]">
        <div className="flex flex-col gap-4">
          <Mascot size={60} tile className="rounded-[18px] p-[5px]" />
          <div>
            <h1 className="font-display text-[32px] font-bold leading-[1.08] tracking-[-0.025em] text-foreground">
              Finanças da família,<br />sem planilha.
            </h1>
            <p className="mt-2 text-[14.5px] leading-[1.45] text-[#5C4C45]">
              {isRegister
                ? 'Crie sua conta — a carteira da família é criada junto.'
                : 'Acesse sua carteira para lançar gastos, acompanhar as faturas e a projeção do mês.'}
            </p>
          </div>
        </div>

        <form onSubmit={isRegister ? handleSignUp : handleLogin} className="flex flex-col gap-4">
          {isRegister && (
            <div className="space-y-1.5">
              <label htmlFor="name" className={LABEL}>Nome</label>
              <Input id="name" type="text" autoComplete="name" placeholder="Ex: João Silva"
                value={name} onChange={(e) => setName(e.target.value)} required className={FIELD} />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className={LABEL}>E-mail</label>
            <Input id="email" type="email" inputMode="email" placeholder="voce@email.com" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required className={FIELD} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className={LABEL}>Senha</label>
            <div className="relative">
              <Input id="password" type={showPw ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? 8 : undefined}
                value={password} onChange={(e) => setPassword(e.target.value)} required
                className={`${FIELD} pr-12`} />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A9968C]">
                {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {isRegister && <p className="text-[11.5px] text-[#7E6E66]">Pelo menos 8 caracteres.</p>}
          </div>

          <Button type="submit" disabled={loading}
            className="h-[54px] rounded-[14px] text-[16px] font-bold">
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isRegister ? 'Criando…' : 'Entrando…'}</>
              : isRegister ? 'Criar conta grátis' : 'Acessar conta'}
          </Button>

          <div className="flex items-center justify-between">
            {isRegister ? (
              <span className="text-[13.5px] text-[#7E6E66]">Já tem conta?</span>
            ) : (
              <button type="button" onClick={handleReset} disabled={resetting}
                className="text-[13.5px] text-[#7E6E66] hover:underline">
                {resetting ? 'Enviando…' : 'Esqueci minha senha'}
              </button>
            )}
            <button type="button" onClick={() => setMode(isRegister ? 'login' : 'register')}
              className="text-[13.5px] font-bold text-accent hover:underline">
              {isRegister ? 'Entrar' : 'Criar conta'}
            </button>
          </div>
        </form>

        <p className="text-center text-[12px] text-muted-foreground">
          &copy; {new Date().getFullYear()} CaRe Wallet
        </p>
      </div>
    </div>
  );
}
