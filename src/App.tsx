import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FinanceProvider } from "@/contexts/FinanceContext";
import { Layout } from "@/components/Layout";
import Dashboard from "./pages/Dashboard";
import FixedExpenses from "./pages/FixedExpenses";
import VariableExpenses from "./pages/VariableExpenses";
import CashManagement from "./pages/CashManagement";
import CreditCards from "./pages/CreditCards";
import FinancialProjection from "./pages/FinancialProjection";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import MonthlyView from "./pages/MonthlyView";
import Investments from "./pages/Investments";
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
              <Route path="/monthly-view" element={<MonthlyView />} />
              <Route path="/fixed-expenses" element={<FixedExpenses />} />
              <Route path="/variable-expenses" element={<VariableExpenses />} />
              <Route path="/cash-management" element={<CashManagement />} />
              <Route path="/credit-cards" element={<CreditCards />} />
              <Route path="/investments" element={<Investments />} />
              <Route path="/financial-projection" element={<FinancialProjection />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/users" element={<Users />} />
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
