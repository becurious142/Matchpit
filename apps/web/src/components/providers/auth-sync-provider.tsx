"use client";

import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useAuthStore } from "@/store/authStore";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

/**
 * AuthSyncProvider - Bridges Clerk session into Zustand authStore
 * and initializes the API client with the auth token getter.
 * Must be mounted inside <ClerkProvider>.
 */
export function AuthSyncProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const setAuthState = useAuthStore((s) => s.setAuthState);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  // Initialize the API base URL and token getter once on mount
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    setBaseUrl(apiUrl);

    setAuthTokenGetter(async () => {
      const token = await getToken();
      return token ?? "";
    });
  }, [getToken]);

  // Sync Clerk state → Zustand authStore
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      clearAuth();
      return;
    }

    // Derive role from Clerk public metadata
    const meta = user?.publicMetadata ?? {};
    const role = (meta.role as "player" | "owner" | "admin") ?? "player";
    const onboardingComplete = (meta.onboardingComplete as boolean) ?? false;

    setAuthState({
      isLoaded: true,
      isSignedIn: true,
      userId: user?.id ?? null,
      role,
      onboardingComplete,
    });
  }, [isLoaded, isSignedIn, user, setAuthState, clearAuth]);

  return <>{children}</>;
}
