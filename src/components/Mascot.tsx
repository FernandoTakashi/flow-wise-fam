// Carolina — a mascote da CaRe Wallet. Usa /public/newlogo.svg.
import { cn } from '@/lib/utils';

export function Mascot({ size = 64, tile = false, className }: { size?: number; tile?: boolean; className?: string }) {
  return (
    <img
      src="/newlogo.svg"
      width={size}
      height={size}
      alt="Carolina, a mascote da CaRe Wallet"
      className={cn(tile && 'bg-primary p-1', className)}
      style={{ width: size, height: size }}
    />
  );
}
