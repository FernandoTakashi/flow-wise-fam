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

function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18A13.98 13.98 0 0 1 10.9 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resending, setResending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  /** null = formulário; 'confirm' = "confirme seu e-mail"; 'reset' = "link de senha enviado" */
  const [sent, setSent] = useState<null | 'confirm' | 'reset'>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return; // o campo é `required`; isso é só uma trava extra
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim().toLowerCase(), { redirectTo: REDIRECT });
      if (error) fail('Erro ao enviar o link', error);
      else { setEmail(resetEmail.trim()); setShowForgot(false); setSent('reset'); }
    } catch (err) {
      fail('Erro ao enviar o link', err);
    } finally {
      setResetting(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: REDIRECT },
      });
      // sucesso: o navegador é redirecionado pro Google, não sobra nada pra fazer aqui.
      if (error) { fail('Não foi possível continuar com o Google', error); setGoogleLoading(false); }
    } catch (err) {
      fail('Não foi possível continuar com o Google', err);
      setGoogleLoading(false);
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

  // ---- "esqueci minha senha" ---------------------------------------------
  if (showForgot) {
    return (
      <div className="flex min-h-screen flex-col justify-center bg-background px-[26px] pb-10 pt-8">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
          <div>
            <h1 className="font-display text-[24px] font-bold text-foreground">Esqueci minha senha</h1>
            <p className="mt-2 text-[14px] leading-[1.5] text-[#5C4C45]">
              Informe o e-mail da sua conta — enviamos um link pra você definir uma senha nova.
            </p>
          </div>
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <label htmlFor="reset-email" className={LABEL}>E-mail</label>
              <Input id="reset-email" type="email" inputMode="email" placeholder="voce@email.com" autoComplete="email"
                autoFocus value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required className={FIELD} />
            </div>
            <Button type="submit" disabled={resetting} className="h-[54px] rounded-[14px] text-[16px] font-bold">
              {resetting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…</> : 'Enviar link de redefinição'}
            </Button>
            <button type="button" onClick={() => setShowForgot(false)}
              className="text-center text-[13.5px] font-semibold text-accent hover:underline">
              Voltar para o login
            </button>
          </form>
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
              <button type="button" onClick={() => { setResetEmail(email); setShowForgot(true); }}
                className="text-[13.5px] text-[#7E6E66] hover:underline">
                Esqueci minha senha
              </button>
            )}
            <button type="button" onClick={() => setMode(isRegister ? 'login' : 'register')}
              className="text-[13.5px] font-bold text-accent hover:underline">
              {isRegister ? 'Entrar' : 'Criar conta'}
            </button>
          </div>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[#EAE1DA]" />
          <span className="text-[12px] font-semibold text-[#A9968C]">ou</span>
          <div className="h-px flex-1 bg-[#EAE1DA]" />
        </div>

        <Button type="button" variant="outline" disabled={googleLoading || loading} onClick={handleGoogle}
          className="h-[52px] rounded-[14px] border-[#E2D7CF] bg-white text-[15px] font-semibold text-[#3C3229] hover:bg-[#FAF6F2]">
          {googleLoading
            ? <Loader2 className="mr-2.5 h-[18px] w-[18px] animate-spin" />
            : <GoogleG className="mr-2.5 h-[18px] w-[18px]" />}
          Continuar com Google
        </Button>

        <p className="text-center text-[12px] text-muted-foreground">
          &copy; {new Date().getFullYear()} CaRe Wallet
        </p>
      </div>
    </div>
  );
}
