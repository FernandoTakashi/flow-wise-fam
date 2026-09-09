import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Mascot } from '@/components/Mascot';

const FIELD = 'h-[52px] rounded-[14px] border-[#E2D7CF] bg-white text-[15px]';
const LABEL = 'text-[12.5px] font-semibold text-[#5C4C45]';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const isRegister = mode === 'register';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) toast({ title: 'Erro ao entrar', description: error.message, variant: 'destructive' });
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (error) {
      toast({ title: 'Erro ao cadastrar', description: error.message, variant: 'destructive' });
      setLoading(false);
    }
    // Sem confirmação de e-mail: a sessão chega sozinha e o App troca de tela.
  };

  const handleReset = async () => {
    if (!email.trim()) {
      toast({ title: 'Informe o e-mail', description: 'Preencha o campo de e-mail primeiro.', variant: 'destructive' });
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    toast(
      error
        ? { title: 'Erro', description: error.message, variant: 'destructive' }
        : { title: 'Verifique seu e-mail', description: 'Enviamos um link para redefinir a senha.' },
    );
    setResetting(false);
  };

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
            <Input id="email" type="email" placeholder="voce@email.com" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required className={FIELD} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className={LABEL}>Senha</label>
            <div className="relative">
              <Input id="password" type={showPw ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? 6 : undefined}
                value={password} onChange={(e) => setPassword(e.target.value)} required
                className={`${FIELD} pr-12`} />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A9968C]">
                {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
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
