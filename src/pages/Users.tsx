import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Users as UsersIcon, Plus, User, ArrowUpCircle, ArrowDownCircle,
  Calendar, Activity, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Users() {
  const { state, addUser } = useFinance(); // <--- Mudou aqui: addUser
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: ''
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL'
    }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    setLoading(true);
    // Chamada ao contexto (Supabase)
    await addUser({
      name: formData.name,
      email: formData.email || undefined
    });
    setLoading(false);

    setFormData({ name: '', email: '' });
    setShowForm(false);
  };

  // ... (Mantenha as funções getUserStats, getActivityIcon, getActivityLabel IGUAIS AO SEU CÓDIGO ANTIGO)
  // Vou pular essa parte repetida para não ficar gigante, mas você mantém a lógica de cálculo
  const getUserStats = (userId: string) => {
    // Copie a lógica que você já tinha no seu arquivo original
    // Apenas para o código compilar, vou retornar zeros aqui, mas MANTENHA A SUA LÓGICA:
    return { totalExpenses: 0, totalIncome: 0, totalOutcome: 0, netMovement: 0, paidFixedExpenses: 0, paidCreditCards: 0, recentActivity: [] as any[] };
  };

  const getActivityIcon = (type: string) => <Activity className="w-4 h-4" />;
  const getActivityLabel = (type: string) => type;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestão de Usuários</h1>
          <p className="text-muted-foreground">Controle e acompanhamento dos usuários</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? 'Cancelar' : 'Novo Usuário'}
        </Button>
      </div>

      {/* Cards de Resumo (Mantenha igual) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-card"><CardContent className="p-6"><div className="flex items-center space-x-2"><UsersIcon className="w-5 h-5 text-primary" /><div><p className="text-sm font-medium text-muted-foreground">Total</p><p className="text-2xl font-bold">{state.users.length}</p></div></div></CardContent></Card>
        {/* ... outros cards ... */}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {showForm && (
          <Card className="shadow-card">
            <CardHeader><CardTitle>Novo Usuário</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary">
                  {loading ? 'Salvando...' : 'Cadastrar Usuário'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Lista de Usuários */}
        <div className={`space-y-4 ${showForm ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
          {state.users.map((user) => (
            <Card key={user.id} className="shadow-card">
              <CardHeader>
                <CardTitle>{user.name}</CardTitle>
                <CardDescription>
                  Desde {user.createdAt ? format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                </CardDescription>
              </CardHeader>
              {/* Conteúdo do Card (Estatísticas) mantenha igual */}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}