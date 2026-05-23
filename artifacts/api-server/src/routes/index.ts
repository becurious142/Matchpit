import { Router, type IRouter, Request, Response } from "express";
import { getMetrics } from "../lib/metrics";
import healthRouter from "./health";
import profileRouter from "./profile";
import venuesRouter from "./venues";
import bookingsRouter from "./bookings";
import hostedMatchesRouter from "./hosted-matches";
import paymentsRouter from "./payments";
import walletRouter from "./wallet";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";
import ownerLeadsRouter from "./owner-leads";
import adminRouter from "./admin";
import adminExtendedRouter from "./admin-extended";
import citiesRouter from "./cities";
import couponsRouter from "./coupons";
import ownerRouter from "./owner";
import communityRouter from "./community";
import squadsRouter from "./squads";
import matchChatRouter from "./match-chat";
import paymentsWebhookRouter from "./payments-webhook";
import moderationRouter from "./moderation";
import adminSeedRouter from "./admin-seed";
import adminAnalyticsRouter from "./admin-analytics";
import adminMaintenanceRouter from "./admin-maintenance";
import adminMonitoringRouter from "./admin-monitoring";
import { adminOpsRouter } from "./admin-ops";
import { reconciliationRouter } from "./reconciliation";
import { adminDisputesRouter } from "./admin-disputes";
import { adminNotificationsRouter } from "./admin-notifications";
import { adminQueuesRouter } from "./admin-queues";
import { adminRiskRouter } from "./admin-risk";
import { globalLimiter, discoveryLimiter } from "../middlewares/rate-limiter";
import { v1Router } from "./api/v1";
import { healthProbesRouter } from "./health-probes";
import { adminQueueMetricsRouter } from "./admin-queue-metrics";
import { adminQueuesBoardRouter } from "./admin-queues-board";

const router: IRouter = Router();

router.use(globalLimiter);

router.use("/api/v1", discoveryLimiter, v1Router);

router.get("/metrics", async (req: Request, res: Response) => {
  try {
    res.set("Content-Type", "text/plain");
    const metrics = await getMetrics();
    res.send(metrics);
  } catch (ex) {
    res.status(500).send("Error generating metrics");
  }
});

router.use(healthProbesRouter);
router.use(healthRouter);
router.use(profileRouter);
router.use(citiesRouter);
router.use(couponsRouter);
router.use(venuesRouter);
router.use(bookingsRouter);
router.use(hostedMatchesRouter);
router.use(matchChatRouter);
router.use(paymentsRouter);
router.use(paymentsWebhookRouter);
router.use(walletRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);
router.use(ownerLeadsRouter);
router.use(ownerRouter);
router.use(adminRouter);
router.use(adminExtendedRouter);
router.use(adminSeedRouter);
router.use(adminAnalyticsRouter);
router.use(adminMaintenanceRouter);
router.use(adminMonitoringRouter);
router.use(moderationRouter);
router.use(communityRouter);
router.use(squadsRouter);
router.use("/admin/ops", adminOpsRouter);
router.use("/admin/reconciliation", reconciliationRouter);
router.use("/admin/disputes", adminDisputesRouter);
router.use("/admin/notifications", adminNotificationsRouter);
router.use("/admin/risk", adminRiskRouter);
router.use(adminQueuesRouter);
router.use("/admin", adminQueueMetricsRouter);
router.use(adminQueuesBoardRouter);

export default router;
