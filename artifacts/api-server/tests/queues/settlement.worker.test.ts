import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@workspace/db";
import { db } from "@workspace/db";
import { settlementBatchesTable, venuePayoutLedgerTable, profilesTable, venuesTable, citiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { processSettlementBatch } from "../../src/queues/workers/settlement.worker";
import crypto from "crypto";

vi.mock("../../src/lib/slack", () => ({
  sendSlackAlert: vi.fn().mockResolvedValue(undefined)
}));

describe("Phase 8C: Settlement Worker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  async function createTestVenue(adminId: string) {
    const venueId = crypto.randomUUID();
    const cityId = crypto.randomUUID();
    
    await db.insert(citiesTable).values({
      id: cityId,
      cityName: `City ${cityId.slice(0, 4)}`,
      slug: `city-${cityId.slice(0, 4)}`,
    });

    await db.insert(venuesTable).values({
      id: venueId,
      name: `Test Venue ${venueId.slice(0, 4)}`,
      city: `Test City`,
      cityId: cityId,
      address: "123 Test St",
      contactPhone: "+911234567890",
      createdBy: adminId,
      pricePerHour: "1000",
    });
    return venueId;
  }

  async function createTestAdmin() {
    const adminId = crypto.randomUUID();
    await db.insert(profilesTable).values({
      id: adminId,
      clerkId: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
      phone: `+91${Math.floor(Math.random() * 10000000000)}`,
      fullName: "Admin User",
      isAdmin: true,
    });
    return adminId;
  }

  it("skips processing if batch is already paid", async () => {
    const adminId = await createTestAdmin();
    const batchId = crypto.randomUUID();
    
    await db.insert(settlementBatchesTable).values({
      id: batchId,
      batchReference: `BATCH-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      status: "paid",
      totalAmount: "1000",
      totalPayouts: 1,
      createdBy: adminId,
    });

    const result = await processSettlementBatch(batchId);
    expect(result).toEqual({ skipped: true, reason: "already_terminal" });
  });

  it("processes chunked settlement correctly", async () => {
    const adminId = await createTestAdmin();
    const venueId = await createTestVenue(adminId);
    const batchId = crypto.randomUUID();
    
    await db.insert(settlementBatchesTable).values({
      id: batchId,
      batchReference: `BATCH-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      status: "batched",
      totalAmount: "2000",
      totalPayouts: 2,
      createdBy: adminId,
    });

    await db.insert(venuePayoutLedgerTable).values([
      {
        id: crypto.randomUUID(),
        venueId,
        referenceId: crypto.randomUUID(),
        referenceType: "match",
        grossAmount: "1000",
        venuePayable: "1000",
        platformCommission: "0",
        payoutType: "match_join",
        status: "batched",
        settlementBatchId: batchId,
      },
      {
        id: crypto.randomUUID(),
        venueId,
        referenceId: crypto.randomUUID(),
        referenceType: "match",
        grossAmount: "1000",
        venuePayable: "1000",
        platformCommission: "0",
        payoutType: "match_join",
        status: "batched",
        settlementBatchId: batchId,
      }
    ]);

    const result = await processSettlementBatch(batchId);
    expect(result.successCount).toBe(2);

    const [updatedBatch] = await db.select().from(settlementBatchesTable).where(eq(settlementBatchesTable.id, batchId));
    expect(updatedBatch.status).toBe("paid");
    expect(updatedBatch.settledAt).not.toBeNull();
  });

  it("throws error if batch is not found", async () => {
    await expect(processSettlementBatch(crypto.randomUUID())).rejects.toThrow(/not found/);
  });
});
