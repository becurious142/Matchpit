import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  adminAuditLogsTable,
} from "@workspace/db";
import { requireAuth, getProfileByClerkId } from "../lib/auth";
import { requireRole } from "../middlewares/rbac";
import { desc, count, eq, inArray, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { reverseMatchPayouts } from "../lib/payouts";
import { processCancellationRefund } from "../lib/refund-routing";

const router = Router();
router.use(requireAuth, requireRole(["admin", "superadmin"]));

router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const [totalCount] = await db
      .select({ count: count() })
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.status, "disputed"));

    const matches = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.status, "disputed"))
      .orderBy(desc(hostedMatchesTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      data: matches,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch disputed matches" });
  }
});

router.post("/:id/resolve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { action, resolutionNotes } = req.body;
    const { userId: clerkId } = getAuth(req);

    if (!clerkId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const adminProfile = await getProfileByClerkId(clerkId);
    if (!adminProfile) {
      return res.status(401).json({ error: "Admin profile not found" });
    }

    if (!["complete", "cancel"].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Must be 'complete' or 'cancel'" });
    }

    const [match] = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.id, id));

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    if (match.status !== "disputed") {
      return res.status(400).json({ 
        error: "Only matches in 'disputed' state can be resolved.",
        currentStatus: match.status 
      });
    }

    if (action === "complete") {
      // Force completion -> transitions to verified and ready for settlement cron
      await db
        .update(hostedMatchesTable)
        .set({
          status: "completed",
          settlementReleasesAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(hostedMatchesTable.id, id));

    } else if (action === "cancel") {
      // Force cancellation -> reverse payouts and issue refunds
      await reverseMatchPayouts(id);
      
      const participants = await db
        .select()
        .from(hostedMatchParticipantsTable)
        .where(
          and(
            eq(hostedMatchParticipantsTable.matchId, id),
            inArray(hostedMatchParticipantsTable.paymentStatus, ["reserve_paid", "final_paid"]),
          ),
        );
        
      for (const participant of participants) {
        const refundAmount = (participant.reservePaidAmount || 0) + (participant.finalPaidAmount || 0);
        if (refundAmount > 0) {
          await processCancellationRefund(participant.userId, id, "hosted_match", refundAmount);
        }
        await db
          .update(hostedMatchParticipantsTable)
          .set({ status: "cancelled", paymentStatus: "refunded", updatedAt: new Date() })
          .where(eq(hostedMatchParticipantsTable.id, participant.id));
      }

      await db
        .update(hostedMatchesTable)
        .set({
          status: "cancelled",
          cancelledReason: resolutionNotes || "Admin cancelled disputed match",
          refundExposure: 0,
          updatedAt: new Date(),
        })
        .where(eq(hostedMatchesTable.id, id));
    }

    // Log the admin action
    await db.insert(adminAuditLogsTable).values({
      adminId: adminProfile.id,
      action: `dispute_resolved_${action}`,
      targetType: "hosted_match",
      targetId: id,
      payload: { resolutionNotes }
    });

    return res.json({ success: true, message: `Match successfully ${action}d` });
  } catch (error) {
    console.error("ADMIN DISPUTES ERROR:", error);
    return res.status(500).json({ error: "Failed to resolve dispute" });
  }
});

export const adminDisputesRouter = router;
