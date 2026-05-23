import { db } from "@workspace/db";
import { paymentsTable, venuePayoutLedgerTable, venuesTable } from "@workspace/db";
import { eq, sum, desc, inArray } from "drizzle-orm";

export class AdminFinanceService {
  async getFinanceDashboard() {
    const [gmv, payoutPending, payoutPaid, payoutTotal] = await Promise.all([
      db
        .select({ total: sum(paymentsTable.amount) })
        .from(paymentsTable)
        .where(eq(paymentsTable.status, "success")),
      db
        .select({ total: sum(venuePayoutLedgerTable.venuePayable) })
        .from(venuePayoutLedgerTable)
        .where(eq(venuePayoutLedgerTable.status, "pending")),
      db
        .select({ total: sum(venuePayoutLedgerTable.venuePayable) })
        .from(venuePayoutLedgerTable)
        .where(eq(venuePayoutLedgerTable.status, "paid")),
      db
        .select({ total: sum(venuePayoutLedgerTable.platformCommission) })
        .from(venuePayoutLedgerTable),
    ]);

    const totalGmv = Number(gmv[0]?.total ?? 0);
    const pendingPayouts = Number(payoutPending[0]?.total ?? 0);
    const paidPayouts = Number(payoutPaid[0]?.total ?? 0);
    const commissionEarned = Number(payoutTotal[0]?.total ?? 0);

    return {
      totalGmv,
      commissionEarned,
      pendingVenuePayouts: pendingPayouts,
      paidVenuePayouts: paidPayouts,
      platformNetRevenue: totalGmv - pendingPayouts - paidPayouts,
    };
  }

  async getVenuePayouts(limit = 100) {
    const payouts = await db
      .select()
      .from(venuePayoutLedgerTable)
      .orderBy(desc(venuePayoutLedgerTable.createdAt))
      .limit(limit);

    if (!payouts.length) {
      return [];
    }

    const venueIds = [...new Set(payouts.map((p) => p.venueId))];
    const venues = await db
      .select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city })
      .from(venuesTable)
      .where(inArray(venuesTable.id, venueIds));
    const venueMap = new Map(venues.map((v) => [v.id, v]));

    return payouts.map((p) => {
      const v = venueMap.get(p.venueId);
      return {
        id: p.id,
        venueId: p.venueId,
        venueName: v?.name ?? "Unknown",
        venueCity: v?.city ?? "",
        referenceId: p.referenceId ?? null,
        referenceType: p.referenceType,
        grossAmount: Number(p.grossAmount),
        razorpayFee: Number(p.razorpayFee),
        platformCommission: Number(p.platformCommission),
        venuePayable: Number(p.venuePayable),
        status: p.status,
        paidAt: p.paidAt?.toISOString() ?? null,
        notes: p.notes ?? null,
        createdAt: p.createdAt.toISOString(),
      };
    });
  }
  async updatePayoutStatus(payoutId: string, status: "pending" | "paid" | "hold", notes?: string) {
    const [payout] = await db
      .select({ status: venuePayoutLedgerTable.status })
      .from(venuePayoutLedgerTable)
      .where(eq(venuePayoutLedgerTable.id, payoutId))
      .limit(1);

    if (!payout) {
      throw new Error("Payout record not found");
    }

    if (["paid", "batched", "processing"].includes(payout.status)) {
      throw new Error("Cannot modify a payout that is already batched or paid");
    }

    const setFields: Record<string, unknown> = { status };
    if (notes !== undefined) setFields.notes = notes;
    if (status === "paid") setFields.paidAt = new Date();

    const [updated] = await db
      .update(venuePayoutLedgerTable)
      .set(setFields)
      .where(eq(venuePayoutLedgerTable.id, payoutId))
      .returning();

    return updated;
  }
}

export const adminFinanceService = new AdminFinanceService();
