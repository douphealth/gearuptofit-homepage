import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import FitnessPage from "./pages/FitnessPage.tsx";
import RunningPage from "./pages/RunningPage.tsx";
import NutritionPage from "./pages/NutritionPage.tsx";
import HealthPage from "./pages/HealthPage.tsx";
import ReviewsPage from "./pages/ReviewsPage.tsx";
import CalculatorsPage from "./pages/CalculatorsPage.tsx";
import AuditPage from "./pages/AuditPage.tsx";
import ExplorePage from "./pages/ExplorePage.tsx";
import StatusPage from "./pages/StatusPage.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/fitness" element={<FitnessPage />} />
          <Route path="/running" element={<RunningPage />} />
          <Route path="/nutrition" element={<NutritionPage />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/calculators" element={<CalculatorsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/status" element={<StatusPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
