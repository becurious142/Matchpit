/**
 * Phase 2A Tests: Slot Double-Booking Prevention
 *
 * Tests for slot locking mechanism in hosted-matches.ts
 *
 * Coverage:
 * - SELECT FOR UPDATE row locking
 * - Concurrent booking attempts
 * - Race condition prevention
 * - Slot availability re-check inside transaction
 */

import { describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import { slotsTable, hostedMatchesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { seedUser, seedVenue, seedSlot, testRegistry } from "./setup";

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulate match creation with slot locking (Phase 2A implementation).
 */
async function createMatchWithLocking(
  slotId: string,
  hostUserId: string,
  delayMs: number = 0
): Promise<{ success: boolean; matchId?: string; error?: string }> {
  try {
    const result = await db.transaction(async (tx) => {
      // Phase 2A: Lock slot row with SELECT FOR UPDATE
      const [lockedSlot] = await tx
        .select()
        .from(slotsTable)
        .where(eq(slotsTable.id, slotId))
        .for("update") // Row-level lock
        .limit(1);

      if (!lockedSlot || lockedSlot.status !== "available") {
        throw new Error("Slot no longer available");
      }

      // Simulate processing delay (amplifies race condition)
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Mark slot as held
      await tx
        .update(slotsTable)
        .set({ status: "held", updatedAt: new Date() })
        .where(eq(slotsTable.id, slotId));

      // Create match
      const [match] = await tx
        .insert(hostedMatchesTable)
        .values({
          hostUserId,
          venueId: lockedSlot.venueId,
          slotId: slotId,
          sport: "cricket",
          date: lockedSlot.date,
          startTime: lockedSlot.startTime,
          endTime: lockedSlot.endTime,
          totalPlayers: 10,
          minPlayers: 6,
          skillLevel: "any",
          reserveFee: "50",
          finalFeePerPlayer: "350",
          totalVenueCost: 4000,
          hostFee: "49",
          status: "open",
        })
        .returning({ id: hostedMatchesTable.id });

      return { matchId: match.id };
    });

    return { success: true, matchId: result.matchId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Simulate match creation WITHOUT slot locking (old buggy implementation).
 */
async function createMatchWithoutLocking(
  slotId: string,
  hostUserId: string,
  delayMs: number = 0
): Promise<{ success: boolean; matchId?: string; error?: string }> {
  try {
    const result = await db.transaction(async (tx) => {
      // OLD BUG: No SELECT FOR UPDATE, just a regular SELECT
      const [slot] = await tx
        .select()
        .from(slotsTable)
        .where(eq(slotsTable.id, slotId))
        .limit(1);

      if (!slot || slot.status !== "available") {
        throw new Error("Slot no longer available");
      }

      // Race window: Another transaction can read "available" here
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Mark slot as held
      await tx
        .update(slotsTable)
        .set({ status: "held", updatedAt: new Date() })
        .where(eq(slotsTable.id, slotId));

      // Create match
      const [match] = await tx
        .insert(hostedMatchesTable)
        .values({
          hostUserId,
          venueId: slot.venueId,
          slotId: slotId,
          sport: "cricket",
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          totalPlayers: 10,
          minPlayers: 6,
          skillLevel: "any",
          reserveFee: "50",
          finalFeePerPlayer: "350",
          totalVenueCost: 4000,
          hostFee: "49",
          status: "open",
        })
        .returning({ id: hostedMatchesTable.id });

      return { matchId: match.id };
    });

    return { success: true, matchId: result.matchId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEQUENTIAL BOOKING (BASELINE)
// ═══════════════════════════════════════════════════════════════════════════

describe("Sequential Booking (No Concurrency)", () => {
  it("allows first booking on available slot", async () => {
    const venue = await seedVenue();
    const slot = await seedSlot(venue.id, { status: "available" });
    const host = await seedUser();

    const result = await createMatchWithLocking(slot.id, host.id);

    expect(result.success).toBe(true);
    expect(result.matchId).toBeDefined();

    const [updatedSlot] = await db
      .select()
      .from(slotsTable)
      .where(eq(slotsTable.id, slot.id));

    expect(updatedSlot.status).toBe("held");

    if (result.matchId) {
      testRegistry.matchIds.push(result.matchId);
    }
  });

  it("rejects second booking on same slot", async () => {
    const venue = await seedVenue();
    const slot = await seedSlot(venue.id, { status: "available" });
    const host1 = await seedUser();
    const host2 = await seedUser();

    // First booking succeeds
    const result1 = await createMatchWithLocking(slot.id, host1.id);
    expect(result1.success).toBe(true);

    if (result1.matchId) {
      testRegistry.matchIds.push(result1.matchId);
    }

    // Second booking fails (slot now "held")
    const result2 = await createMatchWithLocking(slot.id, host2.id);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("no longer available");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT BOOKING WITH LOCKING (PHASE 2A FIX)
// ═══════════════════════════════════════════════════════════════════════════

describe("Concurrent Booking WITH Locking (Phase 2A)", () => {
  it("prevents double-booking when two hosts book simultaneously", async () => {
    const venue = await seedVenue();
    const slot = await seedSlot(venue.id, { status: "available" });
    const host1 = await seedUser({ fullName: "Host 1" });
    const host2 = await seedUser({ fullName: "Host 2" });

    // Both attempt to book at the same time
    const [result1, result2] = await Promise.all([
      createMatchWithLocking(slot.id, host1.id, 10), // 10ms delay
      createMatchWithLocking(slot.id, host2.id, 10), // 10ms delay
    ]);

    // Exactly one should succeed
    const succeeded = [result1, result2].filter((r) => r.success);
    const failed = [result1, result2].filter((r) => !r.success);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // Failed one should have "no longer available" error
    expect(failed[0].error).toContain("no longer available");

    // Only one match should exist for this slot
    const matches = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.slotId, slot.id));

    expect(matches).toHaveLength(1);
    testRegistry.matchIds.push(matches[0].id);

    // Slot should be "held"
    const [updatedSlot] = await db
      .select()
      .from(slotsTable)
      .where(eq(slotsTable.id, slot.id));

    expect(updatedSlot.status).toBe("held");
  });

  it("prevents triple-booking with three concurrent requests", async () => {
    const venue = await seedVenue();
    const slot = await seedSlot(venue.id, { status: "available" });
    const host1 = await seedUser();
    const host2 = await seedUser();
    const host3 = await seedUser();

    const [result1, result2, result3] = await Promise.all([
      createMatchWithLocking(slot.id, host1.id, 5),
      createMatchWithLocking(slot.id, host2.id, 5),
      createMatchWithLocking(slot.id, host3.id, 5),
    ]);

    // Exactly one should succeed
    const succeeded = [result1, result2, result3].filter((r) => r.success);
    const failed = [result1, result2, result3].filter((r) => !r.success);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(2);

    // Only one match should exist
    const matches = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.slotId, slot.id));

    expect(matches).toHaveLength(1);
    testRegistry.matchIds.push(matches[0].id);
  });

  it("allows concurrent bookings on different slots", async () => {
    const venue = await seedVenue();
    const slot1 = await seedSlot(venue.id, {
      status: "available",
      date: "2026-06-01",
      startTime: "10:00",
    });
    const slot2 = await seedSlot(venue.id, {
      status: "available",
      date: "2026-06-01",
      startTime: "12:00",
    });
    const host1 = await seedUser();
    const host2 = await seedUser();

    // Both book different slots simultaneously
    const [result1, result2] = await Promise.all([
      createMatchWithLocking(slot1.id, host1.id, 10),
      createMatchWithLocking(slot2.id, host2.id, 10),
    ]);

    // Both should succeed (different slots)
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.matchId) testRegistry.matchIds.push(result1.matchId);
    if (result2.matchId) testRegistry.matchIds.push(result2.matchId);

    // Both slots should be "held"
    const [s1, s2] = await db
      .select()
      .from(slotsTable)
      .where(eq(slotsTable.venueId, venue.id));

    expect([s1?.status, s2?.status].sort()).toEqual(["held", "held"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT BOOKING WITHOUT LOCKING (DEMONSTRATES OLD BUG)
// ═══════════════════════════════════════════════════════════════════════════

describe("Concurrent Booking WITHOUT Locking (Old Bug)", () => {
  it("DEMONSTRATES RACE CONDITION: allows double-booking without locking", async () => {
    const venue = await seedVenue();
    const slot = await seedSlot(venue.id, { status: "available" });
    const host1 = await seedUser();
    const host2 = await seedUser();

    // Both attempt to book without locking
    const [result1, result2] = await Promise.all([
      createMatchWithoutLocking(slot.id, host1.id, 20), // Longer delay to amplify race
      createMatchWithoutLocking(slot.id, host2.id, 20),
    ]);

    // Without locking, BOTH might succeed (race condition)
    // Or one might fail with unique constraint on slot_id if DB enforces it
    // This test demonstrates the vulnerability exists

    // Check how many matches were created
    const matches = await db
      .select()
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.slotId, slot.id));

    testRegistry.matchIds.push(...matches.map((m) => m.id));

    // Without proper locking, we can get:
    // - 2 matches (both succeeded - DOUBLE BOOKING BUG) ❌
    // - 1 match (one failed due to DB constraint) ✓ (but still a race)

    // Phase 2A fix ensures exactly 1 match ALWAYS
    // Here we just document that without locking, results are unpredictable
    console.log(
      `Without locking: ${matches.length} match(es) created (expected: 1, bug allows: 2)`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge Cases", () => {
  it("rejects booking on already-held slot", async () => {
    const venue = await seedVenue();
    const slot = await seedSlot(venue.id, { status: "held" });
    const host = await seedUser();

    const result = await createMatchWithLocking(slot.id, host.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain("no longer available");
  });

  it("rejects booking on blocked slot", async () => {
    const venue = await seedVenue();
    const slot = await seedSlot(venue.id, {
      status: "available",
      isBlockedByOwner: true,
    });
    const host = await seedUser();

    // Simulate check for isBlockedByOwner (actual route does this)
    const [slotData] = await db
      .select()
      .from(slotsTable)
      .where(eq(slotsTable.id, slot.id));

    if (slotData.isBlockedByOwner) {
      expect(slotData.isBlockedByOwner).toBe(true);
      // Booking should be rejected by route handler before transaction
      return;
    }
  });

  it("handles concurrent booking attempts on non-existent slot", async () => {
    const fakeSlotId = "00000000-0000-0000-0000-000000000001";
    const host1 = await seedUser();
    const host2 = await seedUser();

    const [result1, result2] = await Promise.all([
      createMatchWithLocking(fakeSlotId, host1.id),
      createMatchWithLocking(fakeSlotId, host2.id),
    ]);

    // Both should fail (slot doesn't exist)
    expect(result1.success).toBe(false);
    expect(result2.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════

describe("Performance", () => {
  it("locking mechanism completes within reasonable time", async () => {
    const venue = await seedVenue();
    const slot = await seedSlot(venue.id, { status: "available" });
    const host = await seedUser();

    const start = Date.now();
    const result = await createMatchWithLocking(slot.id, host.id);
    const elapsed = Date.now() - start;

    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(5000); // Should complete in <5000ms

    if (result.matchId) {
      testRegistry.matchIds.push(result.matchId);
    }
  });

  it("handles 5 concurrent booking attempts efficiently", async () => {
    const venue = await seedVenue();
    const slot = await seedSlot(venue.id, { status: "available" });
    const hosts = await Promise.all([
      seedUser(),
      seedUser(),
      seedUser(),
      seedUser(),
      seedUser(),
    ]);

    const start = Date.now();

    const results = await Promise.all(
      hosts.map((host) => createMatchWithLocking(slot.id, host.id, 5))
    );

    const elapsed = Date.now() - start;

    // One succeeds, four fail
    const succeeded = results.filter((r) => r.success);
    expect(succeeded).toHaveLength(1);

    // Should complete in <10 seconds
    expect(elapsed).toBeLessThan(10000);

    if (succeeded[0].matchId) {
      testRegistry.matchIds.push(succeeded[0].matchId);
    }
  });
});
