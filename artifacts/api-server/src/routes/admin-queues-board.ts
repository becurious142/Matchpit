import { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { requireAdmin } from "../lib/auth";
import { cacheRefreshQueue } from "../queues/queues";
import { env } from "../config/env";

const router = Router();

if (env.ENABLE_BULL_BOARD) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues-board");

  createBullBoard({
    queues: [
      new BullMQAdapter(cacheRefreshQueue()),
      // other queues...
    ],
    serverAdapter: serverAdapter,
  });

  router.use("/queues-board", requireAdmin, serverAdapter.getRouter());
}

export const adminQueuesBoardRouter = router;
