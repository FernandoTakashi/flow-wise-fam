import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { WalletSelector } from './WalletSelector'; // Certifique-se de que o caminho está correto

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { toast } = useToast();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Erro ao sair",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* Barra Lateral */}
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Superior Atualizado */}
        <header className="h-16 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
          
          {/* Lado Esquerdo: Seletor de Carteiras */}
          <div className="flex items-center">
            <WalletSelector />
          </div>

          {/* Lado Direito: Botão de Sair */}
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Sair da Conta</span>
            </Button>
          </div>
        </header>

        {/* Área de Conteúdo */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}