import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Wallet, Loader2 } from 'lucide-react';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <Wallet className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">CaRe Wallet</h1>
        <p className="text-sm text-slate-500">Finanças da família, sem planilha</p>
      </div>

      <Tabs defaultValue="login" className="w-full max-w-sm sm:max-w-md">
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="login">Entrar</TabsTrigger>
          <TabsTrigger value="register">Criar conta</TabsTrigger>
        </TabsList>

        <TabsContent value="login">
          <Card className="border-0 shadow-lg sm:border sm:shadow-sm">
            <CardHeader>
              <CardTitle>Bem-vindo de volta</CardTitle>
              <CardDescription>Acesse sua carteira para continuar.</CardDescription>
            </CardHeader>
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" placeholder="voce@email.com" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
                </div>
              </CardContent>
              <CardFooter className="flex-col gap-2">
                <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando…</> : 'Acessar conta'}
                </Button>
                <button type="button" onClick={handleReset} disabled={resetting}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  {resetting ? 'Enviando…' : 'Esqueci minha senha'}
                </button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="register">
          <Card className="border-0 shadow-lg sm:border sm:shadow-sm">
            <CardHeader>
              <CardTitle>Criar nova conta</CardTitle>
              <CardDescription>Sua carteira é criada automaticamente.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSignUp}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" type="text" autoComplete="name" placeholder="Ex: João Silva"
                    value={name} onChange={(e) => setName(e.target.value)} required className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">E-mail</Label>
                  <Input id="register-email" type="email" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Senha</Label>
                  <Input id="register-password" type="password" autoComplete="new-password" minLength={6}
                    value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando…</> : 'Criar conta grátis'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} CaRe Wallet
      </p>
    </div>
  );
}
