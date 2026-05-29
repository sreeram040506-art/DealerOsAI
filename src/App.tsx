import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { lazy, Suspense, useEffect, memo } from "react";

// Preload critical routes
const preloadDashboard = () => import("./pages/Index");
const preloadInventory = () => import("./pages/Inventory");

// Lazy load ALL pages for code splitting (Reports was previously eager-imported)
const Index = lazy(preloadDashboard);
const Inventory = lazy(preloadInventory);
const Sales = lazy(() => import("./pages/Sales"));
const Customers = lazy(() => import("./pages/Customers"));
const Advertising = lazy(() => import("./pages/Advertising"));
const Expenses = lazy(() => import("./pages/Expenses"));
const CashFlow = lazy(() => import("./pages/CashFlow"));
const UsedVehicleForms = lazy(() => import("./pages/UsedVehicleForms"));
const Registry = lazy(() => import("./pages/Registry"));
const RMVCompliance = lazy(() => import("./pages/RMVCompliance"));
const TeamAnalytics = lazy(() => import("./pages/TeamAnalytics"));
const Reports = lazy(() => import("./pages/Reports"));
const Accounting = lazy(() => import("./pages/Accounting"));
const EnterpriseModuleCrud = lazy(() => import("./pages/EnterpriseModuleCrud"));
const Auctions = lazy(() => import("./pages/Auctions"));
const AIInsights = lazy(() => import("./pages/AIInsights"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Settings = lazy(() => import("./pages/Settings"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Preload manager — memoized to prevent re-renders from parent
const PreloadManager = memo(function PreloadManager() {
  const location = useLocation();

  useEffect(() => {
    // Predictive preloading: load the next likely route
    if (location.pathname === '/login') {
      preloadDashboard();
    }
    if (location.pathname === '/') {
      preloadInventory();
    }
  }, [location.pathname]); // Only re-run when pathname changes, not entire location object

  return null;
});

// Loading component — memoized since it never changes
const PageLoader = memo(function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-card text-foreground" role="status" aria-label="Loading page">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-profit animate-spin" aria-hidden="true" />
        <p className="text-muted-foreground font-display animate-pulse font-bold tracking-widest text-xs uppercase">Loading Hub...</p>
      </div>
    </div>
  );
});

// QueryClient configured once at module scope — stable reference
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes — reduces redundant fetches
      gcTime: 10 * 60 * 1000,   // 10 minutes — keeps unused data in cache longer for back-nav
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <Suspense fallback={<PageLoader />}>
              <PreloadManager />
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                
                <Route path="/" element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } />
                <Route path="/inventory" element={
                  <ProtectedRoute>
                    <Inventory />
                  </ProtectedRoute>
                } />
                <Route path="/sales" element={
                  <ProtectedRoute>
                    <Sales />
                  </ProtectedRoute>
                } />
                <Route path="/customers" element={
                  <ProtectedRoute>
                    <Customers />
                  </ProtectedRoute>
                } />
                <Route path="/documents-forms" element={
                  <ProtectedRoute>
                    <UsedVehicleForms />
                  </ProtectedRoute>
                } />
                <Route path="/rmv-compliance" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <RMVCompliance />
                  </ProtectedRoute>
                } />
                <Route path="/marketing" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <Advertising />
                  </ProtectedRoute>
                } />
                <Route path="/ai-insights" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <AIInsights />
                  </ProtectedRoute>
                } />
                <Route path="/accounting" element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <Accounting />
                  </ProtectedRoute>
                } />
                <Route path="/employees" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER', 'STAFF']}>
                    <Attendance />
                  </ProtectedRoute>
                } />
                <Route path="/auctions" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <Auctions />
                  </ProtectedRoute>
                } />
                <Route path="/notifications" element={
                  <ProtectedRoute>
                    <EnterpriseModuleCrud />
                  </ProtectedRoute>
                } />
                <Route path="/api-integrations" element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <EnterpriseModuleCrud />
                  </ProtectedRoute>
                } />
                <Route path="/used-vehicle-forms" element={
                  <ProtectedRoute>
                    <UsedVehicleForms />
                  </ProtectedRoute>
                } />
                <Route path="/registry" element={
                  <ProtectedRoute>
                    <Registry />
                  </ProtectedRoute>
                } />
                <Route path="/advertising" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <Advertising />
                  </ProtectedRoute>
                } />
                <Route path="/expenses" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <Expenses />
                  </ProtectedRoute>
                } />
                <Route path="/cash-flow" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <CashFlow />
                  </ProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <Reports />
                  </ProtectedRoute>
                } />
                <Route path="/team-analytics" element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <TeamAnalytics />
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <Settings />
                  </ProtectedRoute>
                } />
                <Route path="/super-admin" element={
                  <ProtectedRoute roles={['SUPER_ADMIN']}>
                    <SuperAdmin />
                  </ProtectedRoute>
                } />
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
