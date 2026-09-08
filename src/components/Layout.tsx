import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Sidebar, NAV_ITEMS } from './Sidebar';
import { WalletSelector } from './WalletSelector';
import MonthSelector from './MonthSelector';
import {
  LogOut, Menu as MenuIcon, X, LayoutDashboard, ArrowDownCircle, ArrowUpCircle, CreditCard,
} from 'lucide-react';

const MOBILE_PRIMARY = [
  { title: 'Início', href: '/', icon: LayoutDashboard, exact: true },
  { title: 'Lançar', href: '/lancamentos', icon: ArrowDownCircle },
  { title: 'Receitas', href: '/receitas', icon: ArrowUpCircle },
  { title: 'Cartões', href: '/cartoes', icon: CreditCard },
];

function MobileNav() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background/97 backdrop-blur-sm md:hidden">
          <div className="flex items-center justify-between border-b p-4">
            <span className="text-lg font-bold">Menu</span>
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
                    'flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-colors',
                    active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground',
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-xs font-medium leading-tight">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-background px-2 md:hidden">
        {MOBILE_PRIMARY.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href);
          return (
            <Link key={item.href} to={item.href} onClick={() => setMenuOpen(false)}
              className={cn('flex w-16 flex-col items-center gap-1 text-[10px] font-medium',
                active ? 'text-primary' : 'text-muted-foreground')}>
              <Icon className="h-5 w-5" />
              {item.title}
            </Link>
          );
        })}
        <button onClick={() => setMenuOpen((v) => !v)}
          className={cn('flex w-16 flex-col items-center gap-1 text-[10px] font-medium',
            menuOpen ? 'text-primary' : 'text-muted-foreground')}>
          <MenuIcon className="h-5 w-5" />
          Menu
        </button>
      </div>
    </>
  );
}

// Só as páginas que realmente reagem ao mês selecionado mostram o seletor.
const MONTH_SCOPED_ROUTES = ['/', '/lancamentos', '/receitas', '/fixos', '/cartoes'];

export function Layout({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { pathname } = useLocation();
  const showMonthSelector = MONTH_SCOPED_ROUTES.includes(pathname);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast({ title: 'Erro ao sair', description: error.message, variant: 'destructive' });
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border md:block">
        <Sidebar />
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-col items-center gap-2 border-b border-border bg-background/80 px-4 py-2 backdrop-blur-md md:flex-row md:justify-between md:px-6">
          <div className="flex w-full items-center justify-between gap-4 md:w-auto">
            <WalletSelector />
            <Button variant="ghost" size="icon" onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive md:hidden">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>

          {showMonthSelector && (
            <div className="flex w-full justify-center md:absolute md:left-1/2 md:w-auto md:-translate-x-1/2">
              <MonthSelector />
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={handleLogout}
            className="hidden text-muted-foreground hover:bg-destructive/10 hover:text-destructive md:inline-flex">
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </header>

        <main className="flex-1 overflow-auto pb-24 pt-2 md:pb-10">
          <div className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</div>
        </main>

        <MobileNav />
      </div>
    </div>
  );
}
