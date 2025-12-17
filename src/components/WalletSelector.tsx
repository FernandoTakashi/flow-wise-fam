import { useFinance } from '@/contexts/FinanceContext';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Wallet, ArrowLeftRight } from "lucide-react";

export function WalletSelector() {
  const { state, switchAccount } = useFinance();
  
  // Se ainda estiver a carregar ou não houver contas, não mostra nada
  if (!state.currentAccountId || state.availableAccounts.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 border-l pl-4 ml-4">
      <div className="flex items-center gap-2 text-muted-foreground mr-1">
        <Wallet className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider hidden md:inline">
          Carteira:
        </span>
      </div>

      <Select 
        value={state.currentAccountId} 
        onValueChange={(value) => switchAccount(value)}
        disabled={state.isLoading}
      >
        <SelectTrigger className="h-8 w-[160px] md:w-[200px] bg-secondary/50 border-none hover:bg-secondary transition-colors focus:ring-0">
          <SelectValue placeholder="Selecionar Carteira" />
        </SelectTrigger>
        <SelectContent align="end" className="w-[200px]">
          {state.availableAccounts.map((account) => (
            <SelectItem 
              key={account.id} 
              value={account.id}
              className="cursor-pointer"
            >
              <div className="flex flex-col">
                <span className="font-medium text-sm">{account.name}</span>
                {account.id === state.currentAccountId && (
                  <span className="text-[10px] text-primary font-bold">Ativa agora</span>
                )}
              </div>
            </SelectItem>
          ))}
          
          {/* Opcional: Link ou botão para criar nova carteira no futuro */}
        </SelectContent>
      </Select>

      {state.isLoading && (
        <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
      )}
    </div>
  );
}