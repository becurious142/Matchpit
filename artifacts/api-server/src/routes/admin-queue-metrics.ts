import { Router } from "express";
import { requireAdmin } from "../lib/auth";
import { cacheRefreshQueue } from "../queues/queues";

const router = Router();

router.get("/queue-metrics", requireAdmin, async (req, res) => {
  try {
    const metrics = {
      "cache-refresh": {
        waiting: await cacheRefreshQueue().getWaitingCount(),
        active: await cacheRefreshQueue().getActiveCount(),
        delayed: await cacheRefreshQueue().getDelayedCount(),
        failed: await cacheRefreshQueue().getFailedCount(),
      },
      // Other queues would be added here in a complete implementation
    };

    res.json({ metrics });
  } catch (err) {
    req.log.error({ err }, "Error fetching queue metrics");
    res.status(500).json({ error: "internal_error" });
  }
});

export const adminQueueMetricsRouter = router;
