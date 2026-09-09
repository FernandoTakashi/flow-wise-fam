import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// O título da página vive no header do shell (Layout). As páginas continuam
// declarando <PageHeader title subtitle action />; o subtítulo (dinâmico) sobe
// via contexto, o título vem de ROUTE_TITLES no Layout, e a `action` continua
// renderizada aqui (à direita) até cada página ganhar sua própria toolbar.

interface PageHeaderState { subtitle: string | null }
const PageHeaderContext = createContext<{
  state: PageHeaderState;
  setSubtitle: (s: string | null) => void;
}>({ state: { subtitle: null }, setSubtitle: () => {} });

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PageHeaderState>({ subtitle: null });
  return (
    <PageHeaderContext.Provider value={{ state, setSubtitle: (subtitle) => setState({ subtitle }) }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  return useContext(PageHeaderContext).state;
}

export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  const { setSubtitle } = useContext(PageHeaderContext);

  useEffect(() => {
    setSubtitle(subtitle ?? null);
    return () => setSubtitle(null);
  }, [subtitle, setSubtitle]);

  return (
    <>
      {/* Mobile: título ainda no conteúdo (o passo 8 mexe no mobile) */}
      <div className="mb-1 flex flex-col gap-3 md:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 gap-2">{action}</div>}
      </div>

      {/* Desktop: só a ação, alinhada à direita */}
      {action && <div className="mb-5 hidden shrink-0 justify-end gap-2 md:flex">{action}</div>}
    </>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-border bg-muted/10 py-12 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
