// Dica de primeira visita numa página — some sozinha depois de vista uma vez
// (marcado em profile.onboarding.tips, por pessoa). Parte do "tour completo".
import type { ReactNode } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { Lightbulb, X } from 'lucide-react';

export function OnboardingTip({ pageKey, title, children }: { pageKey: string; title: string; children: ReactNode }) {
  const { profile, updateOnboarding } = useFinance();
  if (!profile || profile.onboarding?.tips?.[pageKey]) return null;

  const dismiss = () => { void updateOnboarding({ tips: { [pageKey]: true } }); };

  return (
    <div className="flex items-start gap-3 rounded-[12px] border border-[#DCEDE7] bg-[#F4F9F7] px-4 py-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#1F6B67]" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-[#1F6B67]">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-[#3E8B85]">{children}</div>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dispensar dica"
        className="shrink-0 text-[#7E6E66] hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
