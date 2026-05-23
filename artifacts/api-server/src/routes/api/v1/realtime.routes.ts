import { Router } from "express";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../../../lib/auth";
import { sseManager } from "../../../lib/sse-manager";
import { env } from "../../../config/env";
import ngeohash from "ngeohash";
import { logger } from "../../../lib/logger";
import { ReplayBuffer } from "../../../lib/realtime/replay-buffer";

const router = Router();

const discoveryQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  sport: z.string().min(1),
  lastEventId: z.string().optional(),
});

router.get("/discovery", requireAuth, async (req, res) => {
  if (!env.ENABLE_REALTIME || !env.ENABLE_SSE_DISCOVERY) {
    res.status(404).json({ error: "not_found", message: "Realtime discovery disabled" });
    return;
  }

  try {
    const { userId } = getAuth(req);
    const { lat, lng, sport, lastEventId } = discoveryQuerySchema.parse(req.query);

    // Set standard SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Determine scoped channel: realtime:discovery:{geohash6}:{sport}
    const hash6 = ngeohash.encode(lat, lng, 6);
    const channel = `realtime:discovery:${hash6}:${sport}`;

    const client = sseManager.addClient(userId!, res, [channel], req.ip);

    // Handle reconnect replay buffering
    if (lastEventId) {
      await ReplayBuffer.replay(`realtime:discovery:${hash6}:${sport}`, lastEventId, res);
    }

    req.on("close", () => {
      sseManager.removeClient(client.id);
    });

  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "validation_error", details: err.errors });
    } else {
      req.log.error({ err }, "Error in SSE discovery");
      res.status(500).end();
    }
  }
});

router.get("/matches/:id", requireAuth, async (req, res) => {
  if (!env.ENABLE_REALTIME || !env.ENABLE_SSE_MATCHES) {
    res.status(404).json({ error: "not_found", message: "Realtime matches disabled" });
    return;
  }

  try {
    const { userId } = getAuth(req);
    const matchId = req.params.id;
    const lastEventId = req.query.lastEventId as string | undefined;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const channel = `realtime:match:${matchId}`;
    const client = sseManager.addClient(userId!, res, [channel], req.ip);

    if (lastEventId) {
      await ReplayBuffer.replay(`realtime:match:${matchId}`, lastEventId, res);
    }

    req.on("close", () => {
      sseManager.removeClient(client.id);
    });

  } catch (err) {
    req.log.error({ err }, "Error in SSE match stream");
    res.status(500).end();
  }
});

export const realtimeRoutes = router;
