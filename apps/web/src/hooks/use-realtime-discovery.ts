"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export function useRealtimeDiscovery(lat: number, lng: number, sport: string) {
  const [updates, setUpdates] = useState<any[]>([]);
  const { getToken } = useAuth();

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectSSE = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(
          /\/+$/,
          "",
        );
        const url = `${apiBase}/api/v1/realtime/discovery?lat=${lat}&lng=${lng}&sport=${sport}`;
        
        // SSE with Authorization header requires a custom EventSource implementation 
        // or passing the token via query params if the server supports it.
        // Assuming we pass it via query for now or use a polyfill like event-source-polyfill
        eventSource = new EventSource(`${url}&token=${token}`);

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          setUpdates(prev => [...prev, data]);
        };

        eventSource.onerror = (error) => {
          console.error("SSE Error:", error);
          eventSource?.close();
        };

      } catch (err) {
        console.error("Failed to connect to SSE", err);
      }
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [lat, lng, sport, getToken]);

  return updates;
}
