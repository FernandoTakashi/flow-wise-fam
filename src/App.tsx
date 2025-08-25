import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FinanceProvider } from "@/contexts/FinanceContext";
import { Layout } from "@/components/Layout";
import Dashboard from "./pages/Dashboard";
import NewExpense from "./pages/NewExpense";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <FinanceProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/expenses/new" element={<NewExpense />} />
              {/* Páginas temporárias - serão implementadas */}
              <Route path="/cash" element={<div className="p-8 text-center text-muted-foreground">Gestão de Caixa - Em desenvolvimento</div>} />
              <Route path="/credit-cards" element={<div className="p-8 text-center text-muted-foreground">Cartões de Crédito - Em desenvolvimento</div>} />
              <Route path="/reports" element={<div className="p-8 text-center text-muted-foreground">Relatórios - Em desenvolvimento</div>} />
              <Route path="/charts" element={<div className="p-8 text-center text-muted-foreground">Gráficos - Em desenvolvimento</div>} />
              <Route path="/users" element={<div className="p-8 text-center text-muted-foreground">Usuários - Em desenvolvimento</div>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </FinanceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
