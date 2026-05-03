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
import adminExtendedRouter from "./admin-extended";
import citiesRouter from "./cities";
import couponsRouter from "./coupons";
import ownerRouter from "./owner";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(citiesRouter);
router.use(couponsRouter);
router.use(venuesRouter);
router.use(bookingsRouter);
router.use(hostedMatchesRouter);
router.use(paymentsRouter);
router.use(walletRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);
router.use(ownerLeadsRouter);
router.use(ownerRouter);
router.use(adminRouter);
router.use(adminExtendedRouter);

export default router;
