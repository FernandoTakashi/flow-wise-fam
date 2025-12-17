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
  Users as UsersIcon, Plus, Activity, UserPlus
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
      // 1. Procurar o ID do usuário pelo e-mail na tabela pública app_users
      const { data: userData, error: userError } = await supabase
        .from('app_users')
        .select('id, name')
        .eq('email', formData.email)
        .single();

      if (userError || !userData) {
        throw new Error("Usuário não encontrado. Ele precisa criar uma conta no app primeiro.");
      }

      // 2. Adicionar o usuário como membro da carteira atual (account_id)
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
        title: "Usuário adicionado!", 
        description: `${userData.name} agora tem acesso a esta carteira.` 
      });
      
      refreshData();
      setFormData({ email: '' });
      setShowForm(false);

    } catch (error: any) {
      toast({ 
        title: "Erro ao convidar", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Membros da Carteira</h1>
          <p className="text-muted-foreground">Gerencie quem tem acesso aos dados desta conta</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
          <UserPlus className="w-4 h-4 mr-2" />
          {showForm ? 'Cancelar' : 'Convidar Membro'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <UsersIcon className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Membros</p>
                <p className="text-2xl font-bold">{state.users.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {showForm && (
          <Card className="shadow-card h-fit">
            <CardHeader>
              <CardTitle>Novo Convite</CardTitle>
              <CardDescription>O usuário deve estar cadastrado no app.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail do Usuário *</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="exemplo@email.com"
                    value={formData.email} 
                    onChange={(e) => setFormData({ email: e.target.value })} 
                    required 
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary">
                  {loading ? 'Enviando...' : 'Dar Acesso'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className={`space-y-4 ${showForm ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
          {state.users.length === 0 ? (
             <p className="text-muted-foreground text-center py-10">Nenhum membro vinculado a esta carteira.</p>
          ) : (
            state.users.map((user) => (
              <Card key={user.id} className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center space-x-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{user.name}</CardTitle>
                      <CardDescription>{user.email}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary">Membro</Badge>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}