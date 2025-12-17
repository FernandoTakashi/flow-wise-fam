import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { 
  LogOut, Home, TrendingUp, PlusCircle, Settings, 
  Menu as MenuIcon, X, CreditCard, Wallet, 
  ArrowUpCircle, Calendar, BarChart3, Users, PiggyBank 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { WalletSelector } from './WalletSelector';
import MonthSelector from '@/components/MonthSelector'; 
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

function MenuGridItem({ icon: Icon, label, path, onClick }: { icon: any, label: string, path: string, onClick: () => void }) {
    const location = useLocation();
    const isActive = location.pathname === path;
    return (
      <Link to={path} onClick={onClick} className={cn("flex flex-col items-center justify-center p-3 rounded-xl border transition-all active:scale-95", isActive ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:bg-muted")}>
        <Icon className="w-6 h-6 mb-2" />
        <span className="text-xs font-medium text-center leading-tight">{label}</span>
      </Link>
    );
}

function MobileNav() {
    const location = useLocation();
    const currentPath = location.pathname;
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const hiddenMenuItems = [
      { label: 'Entradas Fixas', icon: ArrowUpCircle, path: '/fixed-incomes' },
      { label: 'Gastos Fixos', icon: Calendar, path: '/fixed-expenses' },
      { label: 'Cartões', icon: CreditCard, path: '/credit-cards' },
      { label: 'Gestão Caixa', icon: Wallet, path: '/cash-management' },
      { label: 'Investimentos', icon: PiggyBank, path: '/investments' },
      { label: 'Relatórios', icon: BarChart3, path: '/reports' },
      { label: 'Projeção', icon: TrendingUp, path: '/financial-projection' },
      { label: 'Usuários', icon: Users, path: '/users' },
      { label: 'Ajustes', icon: Settings, path: '/settings' },
    ];
    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  
    return (
      <>
        {isMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-background/95 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-10 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-bold text-lg">Menu Completo</span>
              <Button variant="ghost" size="icon" onClick={toggleMenu}><X className="w-6 h-6" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><div className="grid grid-cols-3 gap-3">{hiddenMenuItems.map((item) => (<MenuGridItem key={item.path} {...item} onClick={() => setIsMenuOpen(false)} />))}</div></div>
            <div className="h-20" />
          </div>
        )}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-border z-50 px-2 pb-safe-area">
          <div className="flex justify-around items-center h-full">
            <Link to="/" onClick={() => setIsMenuOpen(false)} className={cn("flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors", currentPath === '/' ? "text-primary" : "text-muted-foreground")}>
              <Home className={cn("w-6 h-6", currentPath === '/' && "fill-current/20")} /><span className="text-[10px] font-medium">Início</span>
            </Link>
            <Link to="/reports" onClick={() => setIsMenuOpen(false)} className={cn("flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors", currentPath === '/reports' ? "text-primary" : "text-muted-foreground")}>
              <BarChart3 className={cn("w-6 h-6", currentPath === '/reports' && "fill-current/20")} /><span className="text-[10px] font-medium">Relatórios</span>
            </Link>
            <div className="relative -top-5">
              <Link to="/variable-expenses" onClick={() => setIsMenuOpen(false)} className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform active:scale-95 border-4 border-background">
                <PlusCircle className="w-8 h-8" />
              </Link>
            </div>
            <Link to="/investments" onClick={() => setIsMenuOpen(false)} className={cn("flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors", currentPath === '/investments' ? "text-primary" : "text-muted-foreground")}>
              <PiggyBank className={cn("w-6 h-6", currentPath === '/investments' && "fill-current/20")} /><span className="text-[10px] font-medium">Investir</span>
            </Link>
            <button onClick={toggleMenu} className={cn("flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors", isMenuOpen ? "text-primary" : "text-muted-foreground")}>
              <MenuIcon className="w-6 h-6" /><span className="text-[10px] font-medium">Menu</span>
            </button>
          </div>
        </div>
      </>
    );
}

// --- LAYOUT PRINCIPAL ATUALIZADO ---
interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { toast } = useToast();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: "Erro ao sair", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* SIDEBAR (Desktop) */}
      <div className="hidden md:block h-screen sticky top-0 border-r w-64 shrink-0">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* HEADER GLOBAL (Fixo no topo) */}
        <header className="h-auto min-h-[64px] border-b bg-background/80 backdrop-blur-md flex flex-col gap-2 md:flex-row items-center justify-between px-4 py-2 md:px-6 sticky top-0 z-30 transition-all">
          
          {/* Linha Superior no Mobile / Esquerda no Desktop */}
          <div className="flex items-center justify-between w-full md:w-auto gap-4">
            {/* Wallet Selector */}
            <WalletSelector />

            {/* Logout (Visível aqui no mobile para economizar espaço vertical) */}
            <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleLogout}
                className="md:hidden text-muted-foreground hover:text-destructive"
            >
                <LogOut className="w-5 h-5" />
            </Button>
          </div>

          <div className="w-full md:w-auto flex justify-center md:absolute md:left-1/2 md:-translate-x-1/2">
             <div className="scale-90 md:scale-100 origin-center">
                <MonthSelector />
             </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-24 md:pb-8 pt-2">
          <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>

        <MobileNav />
      </div>
    </div>
  );
}