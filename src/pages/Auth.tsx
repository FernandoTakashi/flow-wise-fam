import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { DollarSign, Loader2 } from "lucide-react"; // Ícone de loading

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  // Função de Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  };

  // Função de Cadastro
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    });

    if (authError) {
      toast({ title: "Erro ao cadastrar", description: authError.message, variant: "destructive" });
    } else if (authData.user) {
      toast({ 
        title: "Conta criada com sucesso!", 
        description: "Verifique seu e-mail para confirmar (se necessário)." 
      });
    }
    
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 animate-in fade-in duration-500">
      
      {/* Logo / Marca para contexto no Mobile */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <DollarSign className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">FinanceApp</h1>
        <p className="text-sm text-slate-500">Gestão financeira simplificada</p>
      </div>

      {/* Container Principal - Adaptável */}
      <Tabs defaultValue="login" className="w-full max-w-sm sm:max-w-md">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="login">Entrar</TabsTrigger>
          <TabsTrigger value="register">Cadastrar</TabsTrigger>
        </TabsList>

        {/* ABA DE LOGIN */}
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
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="seu@email.com"
                    autoComplete="email"
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                    className="h-11" // Altura maior para toque
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    autoComplete="current-password"
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                    className="h-11"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
                  {loading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando...</>
                  ) : (
                    "Acessar Conta"
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* ABA DE CADASTRO */}
        <TabsContent value="register">
          <Card className="border-0 shadow-lg sm:border sm:shadow-sm">
            <CardHeader>
              <CardTitle>Criar nova conta</CardTitle>
              <CardDescription>Comece a controlar suas finanças hoje.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSignUp}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input 
                    id="name" 
                    type="text"
                    autoComplete="name"
                    placeholder="Ex: João Silva"
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    required 
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">E-mail</Label>
                  <Input 
                    id="register-email" 
                    type="email" 
                    autoComplete="email"
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Senha</Label>
                  <Input 
                    id="register-password" 
                    type="password" 
                    autoComplete="new-password"
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                    className="h-11"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
                  {loading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...</>
                  ) : (
                    "Criar Conta Grátis"
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
      
      <p className="mt-8 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} FinanceApp. Todos os direitos reservados.
      </p>
    </div>
  );
}