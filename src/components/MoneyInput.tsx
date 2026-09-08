import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toCents } from '@/lib/money';

interface Props {
  /** valor em centavos */
  valueCents: number;
  onChangeCents: (cents: number) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  required?: boolean;
  autoFocus?: boolean;
}

/**
 * Input de dinheiro. Guarda o texto digitado no pai como centavos.
 * Aceita "1234,56" ou "1234.56"; formata só quando o campo perde o foco.
 */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { valueCents, onChangeCents, placeholder = '0,00', className, id, required, autoFocus }, ref,
) {
  return (
    <Input
      ref={ref}
      id={id}
      inputMode="decimal"
      required={required}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className={cn('font-bold tabular-nums', className)}
      defaultValue={valueCents ? (valueCents / 100).toFixed(2).replace('.', ',') : ''}
      onChange={(e) => onChangeCents(toCents(e.target.value))}
      onBlur={(e) => {
        const cents = toCents(e.target.value);
        e.target.value = cents ? (cents / 100).toFixed(2).replace('.', ',') : '';
      }}
    />
  );
});
