import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Transactions = lazy(() => import('@/pages/Transactions'));
const Receitas = lazy(() => import('@/pages/Receitas'));
const Recurrences = lazy(() => import('@/pages/Recurrences'));
const Cards = lazy(() => import('@/pages/Cards'));
const Investments = lazy(() => import('@/pages/Investments'));
const Projection = lazy(() => import('@/pages/Projection'));
const Reports = lazy(() => import('@/pages/Reports'));
const Settlement = lazy(() => import('@/pages/Settlement'));
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
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (checking) return <FullScreenLoader label="Carregando…" />;

  if (!session) {
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
                  <Route path="/acerto" element={<Settlement />} />
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
