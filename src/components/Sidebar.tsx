import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ArrowDownCircle, ArrowUpCircle, Repeat, CreditCard, PiggyBank,
  TrendingUp, BarChart3, Scale, Settings, Plus, LogOut,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useFinance } from '@/contexts/FinanceContext';
import { cn } from '@/lib/utils';
import { Mascot } from './Mascot';

type BadgeKey = 'tx' | 'fixos' | 'cards';
interface NavItem {
  title: string;
  href: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  badge?: BadgeKey;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Dia a dia',
    items: [
      { title: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
      { title: 'Lançamentos', href: '/lancamentos', icon: ArrowDownCircle, badge: 'tx' },
      { title: 'Receitas', href: '/receitas', icon: ArrowUpCircle },
      { title: 'Gastos fixos', href: '/fixos', icon: Repeat, badge: 'fixos' },
      { title: 'Cartões', href: '/cartoes', icon: CreditCard, badge: 'cards' },
    ],
  },
  {
    label: 'Patrimônio',
    items: [
      { title: 'Investimentos', href: '/investimentos', icon: PiggyBank },
      { title: 'Projeção', href: '/projecao', icon: TrendingUp },
    ],
  },
  {
    label: 'Fechamento',
    items: [
      { title: 'Relatórios', href: '/relatorios', icon: BarChart3 },
      { title: 'Acerto de contas', href: '/acerto', icon: Scale },
      { title: 'Ajustes', href: '/ajustes', icon: Settings },
    ],
  },
];

// Mantido plano para a navegação mobile (Layout).
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function initials(name?: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function Sidebar() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    wallet, profile, cards, selectedMonth, recurrenceOccurrences, monthTransactionsByRef,
  } = useFinance();
  const { month, year } = selectedMonth;

  const badges: Record<BadgeKey, number> = {
    tx: monthTransactionsByRef(month, year).filter((t) => t.kind !== 'income').length,
    fixos: recurrenceOccurrences(month, year)
      .filter((o) => o.recurrence.kind === 'expense' && o.status !== 'paid').length,
    cards: cards.length,
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast({ title: 'Erro ao sair', description: error.message, variant: 'destructive' });
  };

  return (
    <div className="flex h-full flex-col bg-ink px-3.5 py-5 text-on-ink">
      {/* topo */}
      <div className="flex items-center gap-2.5">
        <Mascot size={30} className="shrink-0 rounded-[11px] bg-primary p-[3px]" />
        <div className="min-w-0">
          <div className="font-display text-[16px] font-bold leading-tight text-on-ink">CaRe Wallet</div>
          <div className="whitespace-nowrap text-[11.5px] text-on-ink-muted">Finanças da família</div>
        </div>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={() => navigate('/lancamentos')}
        className="mt-[22px] flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[14.5px] font-semibold text-white transition-colors hover:bg-primary-dark"
      >
        <Plus className="h-5 w-5" />
        Novo lançamento
      </button>

      {/* navegação */}
      <nav className="mt-[22px] flex-1 space-y-[18px] overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.13em] text-[#6E5C54]">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.exact}
                    className={({ isActive }) => cn(
                      'flex h-10 items-center gap-[11px] rounded-[10px] px-2.5 text-[13.5px] transition-colors',
                      isActive
                        ? 'bg-primary font-bold text-white'
                        : 'font-medium text-[#BCA79C] hover:bg-ink-2 hover:text-on-ink',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className="h-[19px] w-[19px] shrink-0" />
                        <span className="truncate">{item.title}</span>
                        {count > 0 && (
                          <span className={cn(
                            'ml-auto text-[11px] font-bold tabular-nums',
                            isActive ? 'text-white/85' : 'text-on-ink-muted',
                          )}>
                            {count}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* rodapé */}
      <div className="mt-[22px] flex items-center gap-2.5 border-t border-ink-border px-2.5 pb-1 pt-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3B2D27] text-[12.5px] font-bold text-[#E4B8A9]">
          {initials(profile?.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-on-ink">{profile?.name ?? '—'}</div>
          <div className="truncate text-[11px] text-on-ink-muted">{wallet?.name ?? '—'}</div>
        </div>
        <button type="button" onClick={logout} aria-label="Sair"
          className="shrink-0 text-on-ink-muted transition-colors hover:text-primary">
          <LogOut className="h-[19px] w-[19px]" />
        </button>
      </div>
    </div>
  );
}
