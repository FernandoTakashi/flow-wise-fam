import { useFinance } from '@/contexts/FinanceContext';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Wallet, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function WalletSelector() {
  const { state, switchAccount } = useFinance();

  // Encontra o nome da conta atual
  const currentAccountName = state.availableAccounts.find(
    acc => acc.id === state.currentAccountId
  )?.name || 'Carteira';

  return (
    <Select 
      value={state.currentAccountId || ''} 
      onValueChange={(value) => switchAccount(value)}
    >
      <SelectTrigger className="w-[140px] md:w-[180px] h-9 bg-background/50 border-primary/20 hover:bg-accent/50 transition-all rounded-full px-3 text-xs md:text-sm font-medium">
        <div className="flex items-center gap-2 truncate">
          <Wallet className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate">{currentAccountName}</span>
        </div>
      </SelectTrigger>
      
      <SelectContent align="start" className="w-[200px]">
        <div className="px-2 py-1.5 text-xs text-muted-foreground font-semibold">
          Minhas Carteiras
        </div>
        {state.availableAccounts.map((account) => (
          <SelectItem key={account.id} value={account.id} className="cursor-pointer">
            {account.name}
          </SelectItem>
        ))}
        <div className="p-1 mt-1 border-t">
            <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-xs font-normal">
                <PlusCircle className="w-3 h-3 mr-2" /> Criar Nova Carteira
            </Button>
        </div>
      </SelectContent>
    </Select>
  );
}