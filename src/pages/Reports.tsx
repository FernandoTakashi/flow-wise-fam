import { useState, useMemo } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Download, 
  Filter, 
  Calendar, 
  DollarSign,
  User,
  Tag,
  CreditCard,
  Search,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ExpenseCategory, ExpenseType } from '@/types';

interface FilterState {
  startDate: string;
  endDate: string;
  category: string;
  type: string;
  paymentMethod: string;
  userId: string;
  description: string;
}

export default function Reports() {
  const { state } = useFinance();
  
  const [filters, setFilters] = useState<FilterState>({
    startDate: '',
    endDate: '',
    category: '',
    type: '',
    paymentMethod: '',
    userId: '',
    description: ''
  });

  const categories: { value: ExpenseCategory; label: string }[] = [
    { value: 'alimentacao', label: 'Alimentação' },
    { value: 'transporte', label: 'Transporte' },
    { value: 'lazer', label: 'Lazer' },
    { value: 'saude', label: 'Saúde' },
    { value: 'educacao', label: 'Educação' },
    { value: 'moradia', label: 'Moradia' },
    { value: 'vestuario', label: 'Vestuário' },
    { value: 'outros', label: 'Outros' }
  ];

  const expenseTypes: { value: ExpenseType; label: string }[] = [
    { value: 'fixo', label: 'Fixo' },
    { value: 'variavel', label: 'Variável' },
    { value: 'cartao_credito', label: 'Cartão de Crédito' }
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const filteredExpenses = useMemo(() => {
    return state.expenses.filter(expense => {
      // Filtro por data
      if (filters.startDate) {
        const expenseDate = new Date(expense.date);
        const startDate = new Date(filters.startDate);
        if (expenseDate < startDate) return false;
      }
      
      if (filters.endDate) {
        const expenseDate = new Date(expense.date);
        const endDate = new Date(filters.endDate);
        if (expenseDate > endDate) return false;
      }

      // Filtro por categoria
      if (filters.category && expense.category !== filters.category) return false;

      // Filtro por tipo
      if (filters.type && expense.type !== filters.type) return false;

      // Filtro por forma de pagamento
      if (filters.paymentMethod && expense.paymentMethod !== filters.paymentMethod) return false;

      // Filtro por usuário
      if (filters.userId && expense.userId !== filters.userId) return false;

      // Filtro por descrição
      if (filters.description && !expense.description.toLowerCase().includes(filters.description.toLowerCase())) return false;

      return true;
    });
  }, [state.expenses, filters]);

  const totalAmount = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const averageAmount = filteredExpenses.length > 0 ? totalAmount / filteredExpenses.length : 0;

  // Estatísticas por categoria
  const categoryStats = categories.map(category => {
    const categoryExpenses = filteredExpenses.filter(expense => expense.category === category.value);
    const categoryTotal = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    return {
      category: category.label,
      total: categoryTotal,
      count: categoryExpenses.length,
      percentage: totalAmount > 0 ? (categoryTotal / totalAmount) * 100 : 0
    };
  }).filter(stat => stat.total > 0).sort((a, b) => b.total - a.total);

  // Estatísticas por usuário
  const userStats = state.users.map(user => {
    const userExpenses = filteredExpenses.filter(expense => expense.userId === user.id);
    const userTotal = userExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    return {
      user: user.name,
      total: userTotal,
      count: userExpenses.length,
      percentage: totalAmount > 0 ? (userTotal / totalAmount) * 100 : 0
    };
  }).filter(stat => stat.total > 0).sort((a, b) => b.total - a.total);

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      category: '',
      type: '',
      paymentMethod: '',
      userId: '',
      description: ''
    });
  };

  const exportToCsv = () => {
    const headers = ['Data', 'Categoria', 'Tipo', 'Forma Pagamento', 'Descrição', 'Valor', 'Usuário'];
    const csvData = filteredExpenses.map(expense => {
      const user = state.users.find(u => u.id === expense.userId);
      const categoryLabel = categories.find(c => c.value === expense.category)?.label || expense.category;
      const typeLabel = expenseTypes.find(t => t.value === expense.type)?.label || expense.type;
      
      return [
        format(new Date(expense.date), 'dd/MM/yyyy', { locale: ptBR }),
        categoryLabel,
        typeLabel,
        expense.paymentMethod,
        expense.description,
        expense.amount.toFixed(2).replace('.', ','),
        user?.name || 'N/A'
      ];
    });

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(';'))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio-gastos-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground">
            Análise detalhada de gastos com filtros avançados
          </p>
        </div>
        <Button 
          onClick={exportToCsv}
          disabled={filteredExpenses.length === 0}
          className="bg-gradient-primary hover:opacity-90"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-primary" />
            <span>Filtros</span>
          </CardTitle>
          <CardDescription>Configure os filtros para personalizar o relatório</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Primeira linha de filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Data Inicial</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endDate">Data Final</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={filters.category} onValueChange={(value) => setFilters({ ...filters, category: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as categorias</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={filters.type} onValueChange={(value) => setFilters({ ...filters, type: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos os tipos</SelectItem>
                  {expenseTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Segunda linha de filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select value={filters.paymentMethod} onValueChange={(value) => setFilters({ ...filters, paymentMethod: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as formas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as formas</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  {state.creditCards.map((card) => (
                    <SelectItem key={card.id} value={card.name}>
                      {card.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={filters.userId} onValueChange={(value) => setFilters({ ...filters, userId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os usuários" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos os usuários</SelectItem>
                  {state.users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Buscar na descrição..."
                value={filters.description}
                onChange={(e) => setFilters({ ...filters, description: e.target.value })}
              />
            </div>

            <div className="space-y-2 flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Limpar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Gastos</p>
                <p className="text-2xl font-bold">{filteredExpenses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Médio</p>
                <p className="text-2xl font-bold">{formatCurrency(averageAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estatísticas por categoria */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Tag className="w-5 h-5 text-primary" />
              <span>Por Categoria</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryStats.map((stat) => (
              <div key={stat.category} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium text-sm">{stat.category}</p>
                  <p className="text-xs text-muted-foreground">{stat.count} gastos</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatCurrency(stat.total)}</p>
                  <p className="text-xs text-muted-foreground">{stat.percentage.toFixed(1)}%</p>
                </div>
              </div>
            ))}
            {categoryStats.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum gasto encontrado</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Estatísticas por usuário */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5 text-primary" />
              <span>Por Usuário</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {userStats.map((stat) => (
              <div key={stat.user} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium text-sm">{stat.user}</p>
                  <p className="text-xs text-muted-foreground">{stat.count} gastos</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatCurrency(stat.total)}</p>
                  <p className="text-xs text-muted-foreground">{stat.percentage.toFixed(1)}%</p>
                </div>
              </div>
            ))}
            {userStats.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum gasto encontrado</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lista de gastos */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-primary" />
              <span>Lista de Gastos</span>
            </div>
            <Badge variant="outline">{filteredExpenses.length} itens</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredExpenses
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((expense) => {
                const user = state.users.find(u => u.id === expense.userId);
                const categoryLabel = categories.find(c => c.value === expense.category)?.label || expense.category;
                const typeLabel = expenseTypes.find(t => t.value === expense.type)?.label || expense.type;
                
                return (
                  <div key={expense.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{expense.description || 'Sem descrição'}</p>
                        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                          <span>{categoryLabel}</span>
                          <span>•</span>
                          <span>{typeLabel}</span>
                          <span>•</span>
                          <span>{expense.paymentMethod}</span>
                          <span>•</span>
                          <span>{user?.name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(expense.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(expense.date), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            
            {filteredExpenses.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Nenhum gasto encontrado</p>
                <p className="text-sm">Ajuste os filtros para encontrar gastos específicos</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}