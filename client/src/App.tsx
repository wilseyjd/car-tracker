import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Auth from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Expenses from "@/pages/expenses";
import Vehicles from "@/pages/vehicles";
import VehicleDetail from "@/pages/vehicle";
import Maintenance from "@/pages/maintenance";
import Value from "@/pages/value";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={Auth} />
      <Route path="/">
        <Protected>
          <Dashboard />
        </Protected>
      </Route>
      <Route path="/expenses">
        <Protected>
          <Expenses />
        </Protected>
      </Route>
      <Route path="/vehicles">
        <Protected>
          <Vehicles />
        </Protected>
      </Route>
      <Route path="/vehicle/:id">
        <Protected>
          <VehicleDetail />
        </Protected>
      </Route>
      <Route path="/maintenance">
        <Protected>
          <Maintenance />
        </Protected>
      </Route>
      <Route path="/value">
        <Protected>
          <Value />
        </Protected>
      </Route>
      <Route path="/settings">
        <Protected>
          <Settings />
        </Protected>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster richColors position="top-center" />
        <Router />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
