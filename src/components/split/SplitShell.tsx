// Shell mínimo do "Dividir" — de propósito NÃO é o Layout/Sidebar da
// carteira: nada de seletor de mês, nada de carteira. Serve tanto pra quem
// já usa o CaRe Wallet quanto pra visitante sem conta nenhuma.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/Mascot';
import { LogOut } from 'lucide-react';

export function SplitShell({ children, isGuest }: { children: ReactNode; isGuest?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <Link to="/dividir" className="flex items-center gap-2 font-display text-[17px] font-bold text-foreground">
          <Mascot size={28} tile className="shrink-0 rounded-[9px] p-[3px]" />
          Split CaRe
        </Link>
        <div className="flex items-center gap-2">
          {!isGuest && (
            <Link to="/" className="hidden text-[13px] font-medium text-muted-foreground hover:text-foreground sm:inline">
              ← Voltar pro CaRe Wallet
            </Link>
          )}
          {!isGuest && (
            <Button variant="ghost" size="sm" onClick={() => void supabase.auth.signOut()}>
              <LogOut className="mr-1.5 h-4 w-4" /> Sair
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">{children}</main>
    </div>
  );
}
