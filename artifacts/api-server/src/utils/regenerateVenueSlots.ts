/**
 * Production data-correctness utilities for venue inventory.
 *
 * regenerateVenueSlotsForNext14Days()
 *   – Deletes future non-booked slots and regenerates them cleanly.
 *
 * backfillVenuePricingDefaults()
 *   – Fills zero-value tier prices and missing slotIntervalMins.
 */

import { db } from "@workspace/db";
import { venuesTable, slotsTable } from "@workspace/db";
import { eq, and, gte, inArray } from "drizzle-orm";
import { addDays, format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type VenueRow = typeof venuesTable.$inferSelect;

interface RegenerateResult {
  venuesProcessed: number;
  slotsDeleted: number;
  slotsCreated: number;
  errors: Array<{ venueId: string; error: string }>;
}

interface BackfillResult {
  venuesUpdated: number;
  errors: Array<{ venueId: string; error: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse "HH:MM" time string and return total minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const parts = time.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  return h * 60 + m;
}

/**
 * Convert total minutes since midnight back to "HH:MM" string.
 */
function minutesToTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Generate an ordered list of { startTime, endTime } slot intervals
 * between openTime and closeTime using the given interval in minutes.
 * Guarantees no duplicate times and stops when endTime would exceed closeTime.
 */
function buildSlotIntervals(
  openTime: string,
  closeTime: string,
  intervalMins: number,
): Array<{ startTime: string; endTime: string }> {
  const openMins = timeToMinutes(openTime);
  const closeMins = timeToMinutes(closeTime);
  const step = intervalMins > 0 ? intervalMins : 60;
  const slots: Array<{ startTime: string; endTime: string }> = [];

  for (let start = openMins; start + step <= closeMins; start += step) {
    slots.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(start + step),
    });
  }

  return slots;
}

// ─── Issue 1: Slot regeneration ───────────────────────────────────────────────

/**
 * For all approved venues:
 *   1. Delete future slots with status 'available', 'unavailable', or 'held'
 *      (booked slots are preserved).
 *   2. Regenerate exactly one slot per interval per venue/date for the next
 *      14 days (today inclusive), all set to status='available',
 *      isBlockedByOwner=false, priceOverride=null.
 */
export async function regenerateVenueSlotsForNext14Days(): Promise<RegenerateResult> {
  const result: RegenerateResult = {
    venuesProcessed: 0,
    slotsDeleted: 0,
    slotsCreated: 0,
    errors: [],
  };

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  // Statuses that are safe to delete (i.e. not a real booking)
  const deletableStatuses = ["available", "unavailable", "held"] as const;

  // Fetch all approved venues
  const venues: VenueRow[] = await db
    .select()
    .from(venuesTable)
    .where(eq(venuesTable.isApproved, true));

  for (const venue of venues) {
    try {
      // ── Step 1: Delete future non-booked slots for this venue ────────────
      const deleteResult = await db
        .delete(slotsTable)
        .where(
          and(
            eq(slotsTable.venueId, venue.id),
            gte(slotsTable.date, todayStr),
            inArray(slotsTable.status, deletableStatuses),
          ),
        );

      // Drizzle returns rowCount on delete with node-postgres
      const deleted = (deleteResult as unknown as { rowCount?: number }).rowCount ?? 0;
      result.slotsDeleted += deleted;

      // ── Step 2: Build insert rows for next 14 days ────────────────────────
      const intervalMins =
        venue.slotIntervalMins > 0 ? venue.slotIntervalMins : 60;

      const intervals = buildSlotIntervals(
        venue.openTime,
        venue.closeTime,
        intervalMins,
      );

      if (intervals.length === 0) {
        // Misconfigured venue: openTime >= closeTime, skip silently
        result.venuesProcessed++;
        continue;
      }

      const insertRows: (typeof slotsTable.$inferInsert)[] = [];

      for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
        const date = format(addDays(today, dayOffset), "yyyy-MM-dd");

        for (const { startTime, endTime } of intervals) {
          insertRows.push({
            venueId: venue.id,
            date,
            startTime,
            endTime,
            status: "available",
            isBlockedByOwner: false,
            priceOverride: null,
            sport: null,
          });
        }
      }

      // ── Step 3: Bulk insert in chunks of 200 ─────────────────────────────
      const CHUNK = 200;
      for (let i = 0; i < insertRows.length; i += CHUNK) {
        const chunk = insertRows.slice(i, i + CHUNK);
        await db.insert(slotsTable).values(chunk);
        result.slotsCreated += chunk.length;
      }

      result.venuesProcessed++;
    } catch (err) {
      result.errors.push({
        venueId: venue.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ─── Issue 2: Venue pricing backfill ─────────────────────────────────────────

/**
 * For each venue where any tier price is 0 (or slotIntervalMins is 0/null),
 * derive sensible defaults from pricePerHour and write them back.
 *
 * Multipliers:
 *   weekdayMorningPrice = round(pricePerHour * 0.80)
 *   weekdayDayPrice     = round(pricePerHour * 1.00)
 *   weekdayEveningPrice = round(pricePerHour * 1.25)
 *   weekendPrice        = round(pricePerHour * 1.40)
 *   slotIntervalMins    = 60  (if 0 or null)
 */
export async function backfillVenuePricingDefaults(): Promise<BackfillResult> {
  const result: BackfillResult = {
    venuesUpdated: 0,
    errors: [],
  };

  // Fetch all venues (both approved and pending may need fixing)
  const venues: VenueRow[] = await db.select().from(venuesTable);

  for (const venue of venues) {
    const needsPricingFix =
      venue.weekdayMorningPrice === 0 ||
      venue.weekdayDayPrice === 0 ||
      venue.weekdayEveningPrice === 0 ||
      venue.weekendPrice === 0;

    const needsIntervalFix = venue.slotIntervalMins === 0;

    if (!needsPricingFix && !needsIntervalFix) {
      continue;
    }

    try {
      const base = Math.round(Number(venue.pricePerHour));

      const updateValues: Partial<typeof venuesTable.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (needsPricingFix) {
        updateValues.weekdayMorningPrice = Math.round(base * 0.8);
        updateValues.weekdayDayPrice = Math.round(base * 1.0);
        updateValues.weekdayEveningPrice = Math.round(base * 1.25);
        updateValues.weekendPrice = Math.round(base * 1.4);
      }

      if (needsIntervalFix) {
        updateValues.slotIntervalMins = 60;
      }

      await db
        .update(venuesTable)
        .set(updateValues)
        .where(eq(venuesTable.id, venue.id));

      result.venuesUpdated++;
    } catch (err) {
      result.errors.push({
        venueId: venue.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
