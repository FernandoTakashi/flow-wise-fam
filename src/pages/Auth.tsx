import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");

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

  // Função de Cadastro Otimizada para Escalabilidade (Multi-User)
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 1. Criar a conta no Supabase Auth com metadados
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name, // O Trigger do SQL usará isso para criar o perfil automaticamente
        },
      },
    });

    if (authError) {
      toast({ title: "Erro ao cadastrar", description: authError.message, variant: "destructive" });
    } else if (authData.user) {
      // 2. Sucesso no cadastro
      // Não inserimos manualmente na 'app_users' aqui para evitar duplicidade com o Trigger
      toast({ 
        title: "Conta criada com sucesso!", 
        description: "Se a confirmação de e-mail estiver ativa, verifique sua caixa de entrada." 
      });
    }
    
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100 p-4">
      <Tabs defaultValue="login" className="w-[400px]">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">Entrar</TabsTrigger>
          <TabsTrigger value="register">Cadastrar</TabsTrigger>
        </TabsList>

        <TabsContent value="login">
          <Card>
            <CardHeader>
              <CardTitle>Acessar Finanças</CardTitle>
              <CardDescription>Entre com seu e-mail e senha.</CardDescription>
            </CardHeader>
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="register">
          <Card>
            <CardHeader>
              <CardTitle>Criar Conta</CardTitle>
              <CardDescription>Crie sua conta para salvar seus dados na nuvem.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSignUp}>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="name">Seu Nome</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-email">E-mail</Label>
                  <Input id="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-password">Senha</Label>
                  <Input id="register-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Criando..." : "Cadastrar"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}