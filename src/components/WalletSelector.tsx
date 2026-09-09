import { useNavigate } from 'react-router-dom';
import { useFinance } from '@/contexts/FinanceContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Wallet, Plus } from 'lucide-react';

export function WalletSelector() {
  const { wallets, walletId, setWallet } = useFinance();
  const navigate = useNavigate();

  return (
    <Select
      value={walletId ?? ''}
      onValueChange={(v) => {
        if (v === '__new__') navigate('/ajustes?tab=carteiras');
        else setWallet(v);
      }}
    >
      <SelectTrigger className="h-[38px] w-[150px] rounded-full border-border bg-card px-3.5 text-[13.5px] font-semibold text-foreground md:w-[200px]">
        <div className="flex items-center gap-2 truncate">
          <Wallet className="h-[17px] w-[17px] shrink-0 text-primary" />
          <SelectValue placeholder="Carteira" />
        </div>
      </SelectTrigger>
      <SelectContent align="start">
        {wallets.map((w) => (
          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
        ))}
        <div className="mt-1 border-t p-1">
          <Button variant="ghost" size="sm" className="h-8 w-full justify-start text-xs font-normal"
            onClick={() => navigate('/ajustes?tab=carteiras')}>
            <Plus className="mr-2 h-3 w-3" /> Nova carteira
          </Button>
        </div>
      </SelectContent>
    </Select>
  );
}
