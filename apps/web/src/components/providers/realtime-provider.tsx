"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useNotificationStore } from "@/store/notificationStore";
import { useWalletStore } from "@/store/walletStore";
import { useMatchPresenceStore } from "@/store/matchPresenceStore";
import { toast } from "sonner"; // Assuming sonner is used for toasts based on typical Next.js apps

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);

  const incrementUnread = useNotificationStore((state) => state.incrementUnread);
  const setBalance = useWalletStore((state) => state.setBalance);
  const updatePresence = useMatchPresenceStore((state) => state.updatePresence);

  useEffect(() => {
    if (!isSignedIn) return;

    let reconnectTimer: NodeJS.Timeout;

    const connectSSE = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        // Clean up existing connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        // Establish central event bus connection
        // Append token as query param since EventSource doesn't support headers natively
        const es = new EventSource(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/realtime?token=${token}`);
        eventSourceRef.current = es;

        es.onopen = () => {
          console.log("[RealtimeBus] Connected");
        };

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Central routing of realtime events to Global Zustand Stores
            switch (data.type) {
              case "NOTIFICATION_NEW":
                incrementUnread();
                toast(data.payload.title, { description: data.payload.message });
                break;
              
              case "WALLET_UPDATE":
                setBalance(data.payload.newBalance);
                if (data.payload.amount > 0) {
                  toast.success(`Received ₹${data.payload.amount}`);
                }
                break;
              
              case "MATCH_PRESENCE_UPDATE":
                updatePresence(data.payload.matchId, {
                  activeViewers: data.payload.viewers,
                  joinedParticipants: data.payload.participants,
                });
                break;
              
              case "MATCH_CHAT_MESSAGE":
                // Handle chat routing
                const { matchId } = data.payload;
                // Just an example of how we might bump unread counts
                updatePresence(matchId, { chatUnreadCount: (useMatchPresenceStore.getState().activeMatches[matchId]?.chatUnreadCount || 0) + 1 });
                break;
                
              default:
                console.log("[RealtimeBus] Unhandled event:", data.type);
            }
          } catch (e) {
            console.error("[RealtimeBus] Error parsing event data", e);
          }
        };

        es.onerror = (err) => {
          console.error("[RealtimeBus] Connection error. Attempting reconnect...", err);
          es.close();
          // Implement jittered backoff in a real prod scenario
          reconnectTimer = setTimeout(connectSSE, 5000);
        };
      } catch (err) {
        console.error("[RealtimeBus] Setup failed", err);
      }
    };

    connectSSE();

    return () => {
      clearTimeout(reconnectTimer);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [isSignedIn, getToken, incrementUnread, setBalance, updatePresence]);

  return <>{children}</>;
}
