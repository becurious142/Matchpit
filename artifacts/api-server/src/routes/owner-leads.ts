import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ownerLeadsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/owner-leads", async (req, res) => {
  try {
    const { venueName, ownerName, phone, city, sports, message } = req.body;

    if (!venueName || !ownerName || !phone || !city || !sports?.length) {
      res.status(400).json({ error: "validation_error", message: "Missing required fields" });
      return;
    }

    const [lead] = await db
      .insert(ownerLeadsTable)
      .values({ venueName, ownerName, phone, city, sports, message: message ?? null })
      .returning();

    res.status(201).json({
      id: lead.id,
      venueName: lead.venueName,
      ownerName: lead.ownerName,
      phone: lead.phone,
      city: lead.city,
      sports: lead.sports ?? [],
      message: lead.message ?? null,
      status: lead.status,
      createdAt: lead.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error submitting owner lead");
    res.status(500).json({ error: "internal_error", message: "Failed to submit lead" });
  }
});

export default router;
