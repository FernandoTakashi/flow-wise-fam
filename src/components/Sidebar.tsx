import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  Wallet,
  CreditCard,
  BarChart3,
  TrendingUp,
  Users,
  Menu,
  X,
  DollarSign,
  Calendar,
  CalendarDays,
  PiggyBank,
  ArrowUpCircle // Novo ícone para Entradas
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigationItems = [
  {
    title: 'Dashboard',
    href: '/',
    icon: LayoutDashboard
  },
  {
    title: 'Controle Mensal',
    href: '/monthly-view',
    icon: CalendarDays
  },
  {
    title: 'Entradas Fixas', // <--- NOVO ITEM
    href: '/fixed-incomes',
    icon: ArrowUpCircle
  },
  {
    title: 'Gastos Fixos',
    href: '/fixed-expenses',
    icon: Calendar
  },
  {
    title: 'Gastos Variáveis',
    href: '/variable-expenses',
    icon: PlusCircle
  },
  {
    title: 'Cartões de Crédito',
    href: '/credit-cards',
    icon: CreditCard
  },
  {
    title: 'Gestão de Caixa',
    href: '/cash-management',
    icon: Wallet
  },
  {
    title: 'Investimentos',
    href: '/investments',
    icon: PiggyBank
  },
  {
    title: 'Projeção Financeira',
    href: '/financial-projection',
    icon: TrendingUp
  },
  {
    title: 'Relatórios e Gráficos',
    href: '/reports',
    icon: BarChart3
  },
  {
    title: 'Usuários',
    href: '/users',
    icon: Users
  }
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div
      className={cn(
        'bg-gradient-card border-r border-border shadow-card transition-all duration-300 ease-in-out flex flex-col',
        isCollapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-foreground">FinanceApp</h1>
                <p className="text-xs text-muted-foreground">Gestão Colaborativa</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            {isCollapsed ? (
              <Menu className="w-4 h-4 text-muted-foreground" />
            ) : (
              <X className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          
          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group',
                active
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <Icon className={cn('w-5 h-5 transition-transform group-hover:scale-110', active && 'text-primary-foreground')} />
              {!isCollapsed && (
                <span className="font-medium text-sm">{item.title}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground text-center">
            <p>Gestão Financeira</p>
            <p className="font-medium">Colaborativa v1.0</p>
          </div>
        </div>
      )}
    </div>
  );
}