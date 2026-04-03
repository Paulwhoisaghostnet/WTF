import { ThemeProvider } from "styled-components";
import original from "react95/dist/themes/original";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { queryClient } from "./lib/query-client";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { WalletProvider } from "./lib/wallet-context";
import { GlobalStyles } from "./global-styles";
import { Desktop } from "./components/layout/Desktop";
import { ProtectedRoute } from "./components/ProtectedRoute";

import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { Rounds } from "./pages/Rounds";
import { RoundDetail } from "./pages/RoundDetail";
import { Challenges } from "./pages/Challenges";
import { SideQuests } from "./pages/SideQuests";
import { Messages } from "./pages/Messages";
import { Marketplace } from "./pages/Marketplace";
import { Leaderboard } from "./pages/Leaderboard";
import { Gallery } from "./pages/Gallery";
import { Links } from "./pages/Links";
import { Faq } from "./pages/Faq";
import { Profile } from "./pages/Profile";
import { Admin } from "./pages/Admin";

function AppContent() {
  const { user, isLoading } = useAuth();

  return (
    <Desktop>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />

        {/* Public pages */}
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/gallery" component={Gallery} />
        <Route path="/links" component={Links} />
        <Route path="/faq" component={Faq} />

        {/* Authenticated pages */}
        <Route path="/dashboard">
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/rounds/:id">
          <ProtectedRoute>
            <RoundDetail />
          </ProtectedRoute>
        </Route>
        <Route path="/rounds">
          <ProtectedRoute>
            <Rounds />
          </ProtectedRoute>
        </Route>
        <Route path="/challenges">
          <ProtectedRoute>
            <Challenges />
          </ProtectedRoute>
        </Route>
        <Route path="/side-quests">
          <ProtectedRoute>
            <SideQuests />
          </ProtectedRoute>
        </Route>
        <Route path="/messages">
          <ProtectedRoute>
            <Messages />
          </ProtectedRoute>
        </Route>
        <Route path="/marketplace">
          <ProtectedRoute>
            <Marketplace />
          </ProtectedRoute>
        </Route>
        <Route path="/profile">
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        </Route>
        <Route path="/admin">
          <ProtectedRoute roles={["host", "cohost"]}>
            <Admin />
          </ProtectedRoute>
        </Route>

        {/* Default route */}
        <Route path="/">
          {user ? <Dashboard /> : <Landing />}
        </Route>
      </Switch>
    </Desktop>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={original}>
        <GlobalStyles />
        <AuthProvider>
          <WalletProvider>
            <AppContent />
          </WalletProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
