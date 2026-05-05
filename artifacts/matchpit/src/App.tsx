import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { useGetMyProfile } from "@workspace/api-client-react";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";

import Home from "@/pages/home";
import Venues from "@/pages/venues";
import VenueDetail from "@/pages/venue-detail";
import Book from "@/pages/book";
import Matches from "@/pages/matches";
import MatchDetail from "@/pages/match-detail";
import HostMatch from "@/pages/host";
import Dashboard from "@/pages/dashboard";
import DashboardBookings from "@/pages/dashboard-bookings";
import DashboardMatches from "@/pages/dashboard-matches";
import DashboardWallet from "@/pages/dashboard-wallet";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";
import ListVenue from "@/pages/list-venue";
import OwnerDashboard from "@/pages/owner-dashboard";
import NotificationsPage from "@/pages/notifications";
import CommunityPage from "@/pages/community";
import SquadsPage from "@/pages/squads";
import SquadDetailPage from "@/pages/squad-detail";
import NotFound from "@/pages/not-found";
import Onboarding from "@/pages/onboarding";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";

function ApiClientSetup() {
  const { getToken } = useAuth();
  
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/" />;
  return <Component />;
}

function OnboardingGuard({ component: Component }: { component: React.ComponentType<any> }) {
  const { isSignedIn, isLoaded } = useUser();
  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const [location] = useLocation();

  if (!isLoaded || profileLoading) return null;
  if (!isSignedIn) return <Redirect to="/" />;
  // Redirect to onboarding if profile exists but onboarding not complete
  if (profile && !profile.onboardingComplete && location !== "/onboarding") {
    return <Redirect to="/onboarding" />;
  }
  return <Component />;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/venues" component={Venues} />
        <Route path="/venues/:id" component={VenueDetail} />
        <Route path="/book/:venueId/:slotId" component={() => <ProtectedRoute component={Book} />} />
        <Route path="/matches" component={Matches} />
        <Route path="/matches/:id" component={MatchDetail} />
        <Route path="/host" component={() => <ProtectedRoute component={HostMatch} />} />

        <Route path="/dashboard" component={() => <OnboardingGuard component={Dashboard} />} />
        <Route path="/dashboard/bookings" component={() => <OnboardingGuard component={DashboardBookings} />} />
        <Route path="/dashboard/matches" component={() => <OnboardingGuard component={DashboardMatches} />} />
        <Route path="/dashboard/wallet" component={() => <OnboardingGuard component={DashboardWallet} />} />

        <Route path="/profile" component={() => <OnboardingGuard component={Profile} />} />
        <Route path="/dashboard/notifications" component={() => <OnboardingGuard component={NotificationsPage} />} />
        <Route path="/admin" component={() => <ProtectedRoute component={Admin} />} />
        <Route path="/owner" component={() => <OnboardingGuard component={OwnerDashboard} />} />
        <Route path="/onboarding" component={() => <ProtectedRoute component={Onboarding} />} />
        <Route path="/community" component={CommunityPage} />
        <Route path="/squads" component={SquadsPage} />
        <Route path="/squads/:id" component={SquadDetailPage} />
        <Route path="/list-venue" component={ListVenue} />

        <Route path="/sign-in/*?">
          <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
            <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
          </div>
        </Route>
        <Route path="/sign-up/*?">
          <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
            <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
          </div>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey || ""}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <ApiClientSetup />
        <Router />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <TooltipProvider>
        <ClerkProviderWithRoutes />
        <Toaster />
      </TooltipProvider>
    </WouterRouter>
  );
}

export default App;
