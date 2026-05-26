"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { AuthSyncProvider } from "@/components/providers/auth-sync-provider";
import { WalletSyncProvider } from "@/components/providers/wallet-sync-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { GlobalCheckoutSheet } from "@/components/checkout/global-checkout-sheet";
import { Toaster } from "@/components/ui/sonner";

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
  });
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 2,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true, // resilient to network drops
      },
    },
  });
}

// Singleton on client to prevent cache loss on re-renders
let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new client
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <PostHogProvider client={posthog}>
      <QueryClientProvider client={queryClient}>
        {/* Layer 1: Auth sync — must be first so API token getter is configured */}
        <AuthSyncProvider>
          {/* Layer 2: Wallet sync — depends on auth */}
          <WalletSyncProvider>
            {/* Layer 3: Realtime event bus — depends on auth */}
            <RealtimeProvider>
              {children}
              {/* Global UI overlays */}
              <GlobalCheckoutSheet />
              <Toaster richColors position="top-right" />
            </RealtimeProvider>
          </WalletSyncProvider>
        </AuthSyncProvider>
      </QueryClientProvider>
    </PostHogProvider>
  );
}
