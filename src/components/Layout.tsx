import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Sidebar, NAV_ITEMS } from './Sidebar';
import { WalletSelector } from './WalletSelector';
import MonthSelector from './MonthSelector';
import { PageHeaderProvider, usePageHeader } from './PageHeader';
import { OnboardingWizard } from './OnboardingWizard';
import { Button } from '@/components/ui/button';
import {
  Menu as MenuIcon, X, LogOut, LayoutDashboard, Plus, Repeat, CreditCard,
} from 'lucide-react';

const MONTH_SCOPED_ROUTES = ['/', '/lancamentos', '/receitas', '/fixos', '/cartoes'];

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/lancamentos': 'Lançamentos',
  '/receitas': 'Receitas',
  '/fixos': 'Gastos fixos',
  '/cartoes': 'Cartões',
  '/investimentos': 'Investimentos',
  '/projecao': 'Projeção',
  '/relatorios': 'Relatórios',
  '/acerto': 'Acerto de contas',
  '/ajustes': 'Ajustes',
};

const MOBILE_PRIMARY = [
  { title: 'Início', href: '/', icon: LayoutDashboard, exact: true },
  { title: 'Fixos', href: '/fixos', icon: Repeat },
  { title: 'Cartões', href: '/cartoes', icon: CreditCard },
];

type MobileItem = { title: string; href: string; icon: typeof LayoutDashboard; exact?: boolean };

function TabItem({ item, location, onClick }: {
  item: MobileItem; location: ReturnType<typeof useLocation>; onClick: () => void;
}) {
  const Icon = item.icon;
  const active = item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href);
  return (
    <Link to={item.href} onClick={onClick}
      className={cn('flex w-16 flex-col items-center gap-1 text-[10.5px] font-semibold',
        active ? 'text-[#D24E36]' : 'text-[#7E6E66]')}>
      <Icon className="h-[25px] w-[25px]" />
      {item.title}
    </Link>
  );
}

function MobileNav() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {menuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background md:hidden">
          <div className="flex items-center justify-between border-b p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <span className="font-display text-lg font-bold">Menu</span>
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)}><X className="h-6 w-6" /></Button>
          </div>
          <div className="grid flex-1 grid-cols-3 content-start gap-3 overflow-y-auto p-4">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-[14px] border p-4 text-center transition-colors',
                    active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground',
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-xs font-medium leading-tight">{item.title}</span>
                </Link>
              );
            })}
          </div>
          <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" className="w-full text-muted-foreground"
              onClick={() => { setMenuOpen(false); void supabase.auth.signOut(); }}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 flex h-[calc(86px+env(safe-area-inset-bottom))] items-start justify-around border-t border-[#EAE1DA] bg-background px-2 pt-2.5 md:hidden">
        {MOBILE_PRIMARY.slice(0, 2).map((item) => (
          <TabItem key={item.href} item={item} location={location} onClick={() => setMenuOpen(false)} />
        ))}

        <Link to="/lancamentos?new=1" onClick={() => setMenuOpen(false)}
          className="flex w-16 flex-col items-center gap-1 text-[10.5px] font-semibold text-[#D24E36]">
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-primary text-white">
            <Plus className="h-[30px] w-[30px]" />
          </span>
          Lançar
        </Link>

        {MOBILE_PRIMARY.slice(2).map((item) => (
          <TabItem key={item.href} item={item} location={location} onClick={() => setMenuOpen(false)} />
        ))}

        <button onClick={() => setMenuOpen((v) => !v)}
          className={cn('flex w-16 flex-col items-center gap-1 text-[10.5px] font-semibold',
            menuOpen ? 'text-[#D24E36]' : 'text-[#7E6E66]')}>
          <MenuIcon className="h-[25px] w-[25px]" />
          Mais
        </button>
      </div>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { subtitle, extra } = usePageHeader();
  const showMonthSelector = MONTH_SCOPED_ROUTES.includes(pathname);
  const title = ROUTE_TITLES[pathname] ?? '';

  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:h-screen md:grid-cols-[252px_minmax(0,1fr)]">
      <OnboardingWizard />
      <aside className="hidden md:block md:h-screen md:overflow-hidden">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-col md:h-screen md:overflow-hidden">
        {/* header desktop — título da página vem para cá */}
        <header className="hidden h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-8 md:flex">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2 truncate font-display text-[19px] font-bold leading-tight text-foreground">
              {title}
              {extra}
            </span>
            {subtitle && <span className="truncate text-[12px] text-muted-foreground">{subtitle}</span>}
          </div>
          {showMonthSelector && <MonthSelector />}
          <div className="flex flex-1 justify-end">
            <WalletSelector />
          </div>
        </header>

        {/* header mobile */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
          <WalletSelector />
          {showMonthSelector && <MonthSelector />}
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 md:px-8 md:pb-10 md:pt-7">
            {children}
          </div>
        </main>

        <MobileNav />
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <PageHeaderProvider>
      <Shell>{children}</Shell>
    </PageHeaderProvider>
  );
}
