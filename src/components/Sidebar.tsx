import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ArrowDownCircle, ArrowUpCircle, Repeat, CreditCard, PiggyBank,
  TrendingUp, BarChart3, Scale, Settings, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAV_ITEMS = [
  { title: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
  { title: 'Lançamentos', href: '/lancamentos', icon: ArrowDownCircle },
  { title: 'Receitas', href: '/receitas', icon: ArrowUpCircle },
  { title: 'Gastos fixos', href: '/fixos', icon: Repeat },
  { title: 'Cartões', href: '/cartoes', icon: CreditCard },
  { title: 'Investimentos', href: '/investimentos', icon: PiggyBank },
  { title: 'Projeção', href: '/projecao', icon: TrendingUp },
  { title: 'Relatórios', href: '/relatorios', icon: BarChart3 },
  { title: 'Acerto de contas', href: '/acerto', icon: Scale },
  { title: 'Ajustes', href: '/ajustes', icon: Settings },
];

export function Sidebar() {
  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="h-4 w-4" />
        </div>
        <div>
          <h1 className="font-semibold leading-tight text-foreground">CaRe Wallet</h1>
          <p className="text-xs text-muted-foreground">Finanças da família</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.exact}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.title}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
