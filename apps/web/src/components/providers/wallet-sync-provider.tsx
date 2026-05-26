"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWalletStore } from "@/store/walletStore";
import { useGetWallet } from "@workspace/api-client-react";

/**
 * WalletSyncProvider - Fetches wallet from API and syncs into Zustand walletStore.
 * Only active for signed-in users. Polls every 60s as a fallback to SSE.
 */
export function WalletSyncProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const setBalance = useWalletStore((s) => s.setBalance);

  const { data: wallet } = useGetWallet({
    query: {
      enabled: !!isSignedIn,
      refetchInterval: 60 * 1000, // fallback polling — SSE will be primary
      staleTime: 30 * 1000,
    },
  });

  useEffect(() => {
    if (wallet?.balance !== undefined) {
      setBalance(wallet.balance);
    }
  }, [wallet, setBalance]);

  return <>{children}</>;
}
