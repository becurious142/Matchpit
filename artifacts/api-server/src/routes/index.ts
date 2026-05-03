import { Router, type IRouter } from "express";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(venuesRouter);
router.use(bookingsRouter);
router.use(hostedMatchesRouter);
router.use(paymentsRouter);
router.use(walletRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);
router.use(ownerLeadsRouter);
router.use(adminRouter);

export default router;
