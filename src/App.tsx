import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, Navigate } from "react-router-dom"; // Removi BrowserRouter daqui pois está no main.tsx
import { FinanceProvider } from "@/contexts/FinanceContext";
import { Layout } from "@/components/Layout";
import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";

// Páginas
import AuthPage from "@/pages/Auth";
import Dashboard from "./pages/Dashboard";
import FixedExpenses from "./pages/FixedExpenses";
import FixedIncomes from "./pages/FixedIncomes";
import VariableExpenses from "./pages/VariableExpenses";
import CashManagement from "./pages/CashManagement";
import CreditCards from "./pages/CreditCards";
import FinancialProjection from "./pages/FinancialProjection";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Investments from "./pages/Investments";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Lógica de Autenticação
  useEffect(() => {
    // 1. Verifica sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Escuta mudanças (Login/Logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  // SE NÃO ESTIVER LOGADO -> MOSTRA APENAS TELA DE LOGIN
  if (!session) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthPage />
        <Toaster />
      </QueryClientProvider>
    );
  }

  // SE ESTIVER LOGADO -> MOSTRA SEU APP COMPLETO
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FinanceProvider>
          <Toaster />
          <Sonner />
          
          {/* O BrowserRouter foi removido daqui pois já está no main.tsx */}
          
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/fixed-expenses" element={<FixedExpenses />} />
              <Route path="/fixed-incomes" element={<FixedIncomes />} />
              <Route path="/variable-expenses" element={<VariableExpenses />} />
              <Route path="/cash-management" element={<CashManagement />} />
              <Route path="/credit-cards" element={<CreditCards />} />
              <Route path="/investments" element={<Investments />} />
              <Route path="/financial-projection" element={<FinancialProjection />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/users" element={<Users />} />
              
              {/* Rota coringa */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>

        </FinanceProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;