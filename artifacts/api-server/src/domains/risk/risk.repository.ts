import { db, fraudFlagsTable, riskEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export class RiskRepository {
  async getOpenFraudFlags() {
    return await db
      .select()
      .from(fraudFlagsTable)
      .where(eq(fraudFlagsTable.status, "open"))
      .orderBy(desc(fraudFlagsTable.score));
  }

  async resolveFraudFlag(flagId: string, resolution: "resolved" | "dismissed", action: string, adminId: string) {
    const [flag] = await db
      .update(fraudFlagsTable)
      .set({
        status: resolution,
        reviewedBy: adminId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
        metadata: { action_taken: action },
      })
      .where(eq(fraudFlagsTable.id, flagId))
      .returning();
    return flag || null;
  }

  async getRiskEventsByUserId(userId: string) {
    return await db
      .select()
      .from(riskEventsTable)
      .where(eq(riskEventsTable.userId, userId))
      .orderBy(desc(riskEventsTable.createdAt));
  }
}

export const riskRepository = new RiskRepository();
