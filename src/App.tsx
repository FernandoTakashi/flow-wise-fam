import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { FinanceProvider } from '@/contexts/FinanceContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Layout } from '@/components/Layout';
import AuthPage from '@/pages/Auth';
import ResetPassword from '@/pages/ResetPassword';

const SplitApp = lazy(() => import('@/pages/split/SplitApp'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Transactions = lazy(() => import('@/pages/Transactions'));
const Receitas = lazy(() => import('@/pages/Receitas'));
const Recurrences = lazy(() => import('@/pages/Recurrences'));
const Cards = lazy(() => import('@/pages/Cards'));
const Investments = lazy(() => import('@/pages/Investments'));
const Projection = lazy(() => import('@/pages/Projection'));
const Reports = lazy(() => import('@/pages/Reports'));
const Settings = lazy(() => import('@/pages/Settings'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient();

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="mt-4 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

const App = () => {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  // usuário chegou pelo link de "redefinir senha" — precisa definir a nova
  const [recovery, setRecovery] = useState(
    typeof window !== 'undefined' && window.location.hash.includes('type=recovery'),
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Voltou de "Criar conta"/"Entrar" aberto a partir de um convite do
  // Dividir (?invite=<id>, ver SplitInvite.tsx/Auth.tsx) sem sair da
  // página (login direto, sem precisar confirmar e-mail) — a sessão de
  // verdade aparece mas a URL não muda sozinha, então volta pro convite
  // manualmente em vez de cair no Dashboard. Quando o retorno vem de um
  // redirect de verdade (confirmação de e-mail ou Google), o link já
  // aponta direto pra /dividir/convite/<id> e nem passa por aqui.
  useEffect(() => {
    if (!session || session.user.is_anonymous) return;
    const inviteId = new URLSearchParams(window.location.search).get('invite');
    if (inviteId) window.location.href = `/dividir/convite/${inviteId}`;
  }, [session]);

  if (checking) return <FullScreenLoader label="Carregando…" />;

  // Sessão anônima (criada só pra entrar num grupo do Dividir como visitante)
  // NUNCA conta como login de verdade aqui — sem isso, quem chega na
  // carteira normal com essa sessão ainda ativa cai direto no Dashboard
  // com uma conta sem nenhuma carteira (handle_new_user pula a criação pra
  // anônimo de propósito), quebrando a tela em vez de pedir login.
  const isRealSession = !!session && !session.user.is_anonymous;

  // "Dividir" é apartado de propósito: fora do Layout/FinanceProvider da
  // carteira, e acessível mesmo sem sessão (o convite cria uma na hora).
  if (location.pathname.startsWith('/dividir')) {
    return (
      <QueryClientProvider client={queryClient}>
        <Toaster />
        <Suspense fallback={<FullScreenLoader label="Carregando…" />}>
          <SplitApp session={session} />
        </Suspense>
      </QueryClientProvider>
    );
  }

  if (recovery) {
    return (
      <QueryClientProvider client={queryClient}>
        <ResetPassword onDone={() => {
          setRecovery(false);
          if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
        }} />
        <Toaster />
      </QueryClientProvider>
    );
  }

  if (!isRealSession) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthPage />
        <Toaster />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <FinanceProvider>
            <Toaster />
            <Sonner />
            <Layout>
              <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Carregando seção…</div>}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/lancamentos" element={<Transactions kind="expense" />} />
                  <Route path="/receitas" element={<Receitas />} />
                  <Route path="/fixos" element={<Recurrences kind="expense" />} />
                  <Route path="/saidas" element={<Navigate to="/lancamentos" replace />} />
                  <Route path="/entradas" element={<Navigate to="/receitas" replace />} />
                  <Route path="/cartoes" element={<Cards />} />
                  <Route path="/investimentos" element={<Investments />} />
                  <Route path="/projecao" element={<Projection />} />
                  <Route path="/relatorios" element={<Reports />} />
                  <Route path="/ajustes" element={<Settings />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </Layout>
          </FinanceProvider>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
