"use client";

import { useAuth } from "@clerk/nextjs";

/**
 * Placeholder for a future global SSE event bus.
 * Backend streams are per-feature under /api/v1/realtime/* today.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();

  // Reserved: wire up when /api/v1/realtime hub endpoint exists.
  void isSignedIn;

  return <>{children}</>;
}
