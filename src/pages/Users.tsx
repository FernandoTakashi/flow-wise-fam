import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import {
  Users as UsersIcon, UserPlus, Mail, Shield, X, Check
} from 'lucide-react';

export default function Users() {
  const { state, refreshData } = useFinance();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) return;
    if (!state.currentAccountId) {
        toast({ title: "Erro", description: "Carteira não identificada.", variant: "destructive" });
        return;
    }

    setLoading(true);

    try {
      // 1. Procurar usuário
      const { data: userData, error: userError } = await supabase
        .from('app_users')
        .select('id, name')
        .eq('email', formData.email)
        .single();

      if (userError || !userData) {
        throw new Error("Usuário não encontrado. Ele precisa criar uma conta no app primeiro.");
      }

      // 2. Adicionar membro
      const { error: memberError } = await supabase
        .from('account_members')
        .insert({
          account_id: state.currentAccountId,
          user_id: userData.id,
          role: 'member'
        });

      if (memberError) {
        if (memberError.code === '23505') throw new Error("Este usuário já faz parte desta carteira.");
        throw memberError;
      }

      toast({ 
        title: "Convite enviado!", 
        description: `${userData.name} agora tem acesso.` 
      });
      
      refreshData();
      setFormData({ email: '' });
      setShowForm(false);

    } catch (error: any) {
      toast({ 
        title: "Não foi possível convidar", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Membros</h1>
          <p className="text-sm text-muted-foreground">Quem tem acesso a esta carteira</p>
        </div>
        
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="w-full md:w-auto bg-gradient-primary h-11 md:h-10 text-base">
            <UserPlus className="w-5 h-5 mr-2" /> Convidar Membro
          </Button>
        )}
      </div>

      {/* KPI Simples */}
      <div className="grid grid-cols-1">
        <Card className="shadow-card bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
               <UsersIcon className="w-5 h-5" />
            </div>
            <div>
               <p className="text-xs font-medium text-muted-foreground">Total de Acessos</p>
               <p className="text-xl font-bold text-foreground">{state.users.length} <span className="text-xs font-normal text-muted-foreground">usuários ativos</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FORMULÁRIO DE CONVITE */}
      {showForm && (
        <Card className="shadow-card animate-in slide-in-from-top-4 border-primary/20">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Novo Convite</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} className="h-8 w-8"><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail do Usuário</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        id="email" 
                        type="email" 
                        placeholder="exemplo@email.com"
                        value={formData.email} 
                        onChange={(e) => setFormData({ email: e.target.value })} 
                        required 
                        className="pl-9 h-11"
                    />
                </div>
                <p className="text-[10px] text-muted-foreground">
                    O usuário já deve ter baixado o app e criado uma conta.
                </p>
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 bg-gradient-primary">
                {loading ? 'Processando...' : 'Dar Acesso'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* LISTA DE MEMBROS */}
      <div className="space-y-3">
        {state.users.length === 0 ? (
            <div className="text-center py-10 bg-card rounded-lg border border-dashed">
                <UsersIcon className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Nenhum membro encontrado.</p>
            </div>
        ) : (
          state.users.map((user) => (
            <Card key={user.id} className="shadow-sm border-none bg-card border shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Avatar com Iniciais */}
                  <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-sm md:text-base border border-primary/10">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  
                  {/* Infos */}
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm md:text-base text-foreground">{user.name}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[180px] md:max-w-none">{user.email}</span>
                  </div>
                </div>

                {/* Badge de Cargo */}
                <Badge variant="secondary" className="flex items-center gap-1 bg-muted">
                    <Shield className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px]">Membro</span>
                </Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}