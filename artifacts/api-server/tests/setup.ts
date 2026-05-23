/**
 * HM11A — Integration Test Setup
 *
 * Provides:
 *  - Shared DB helpers for seeding test data
 *  - Cleanup hooks to wipe test rows after each test
 *  - Utility functions mirroring production business logic
 *
 * Requires: TEST_DATABASE_URL env var pointing to an isolated Postgres DB.
 * All helpers use a unique test-run prefix to avoid collisions.
 */

// Load .env from workspace root before any imports
import { config } from "dotenv";
config({ path: "../../.env" });

import { vi, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "@workspace/db";
import {
  profilesTable,
  venuesTable,
  slotsTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  hostedMatchReservationsTable,
  paymentsTable,
  paymentWebhookEventsTable,
  venuePayoutLedgerTable,
  walletLedgerTable,
  reconciliationReportsTable,
  matchAttendanceConfirmationsTable,
  rewardEventsTable,   // Phase 5
  referralsTable,      // Phase 5
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// ─── Test State Registry ───────────────────────────────────────────────────────
// Track all created entity IDs so afterEach can clean up without truncation.
export const testRegistry = {
  profileIds: [] as string[],
  venueIds: [] as string[],
  slotIds: [] as string[],
  matchIds: [] as string[],
  paymentIds: [] as string[],
  reservationIds: [] as string[],
  participantIds: [] as string[],
  attendanceIds: [] as string[],  // Phase 3
  payoutIds: [] as string[],
  webhookEventIds: [] as string[],
  ledgerEntryIds: [] as string[],
  reconciliationIds: [] as string[],
  rewardEventIds: [] as string[],  // Phase 5
  referralIds: [] as string[],     // Phase 5
};

// ─── Cleanup ──────────────────────────────────────────────────────────────────
export async function cleanupTestData() {
  const r = testRegistry;

  try {
    // Cleanup in reverse dependency order
    if (r.reconciliationIds.length)
      await db.delete(reconciliationReportsTable).where(inArray(reconciliationReportsTable.id, r.reconciliationIds));
    if (r.webhookEventIds.length)
      await db.delete(paymentWebhookEventsTable).where(inArray(paymentWebhookEventsTable.id, r.webhookEventIds));
    if (r.payoutIds.length)
      await db.delete(venuePayoutLedgerTable).where(inArray(venuePayoutLedgerTable.id, r.payoutIds));
    if (r.attendanceIds.length)  // Phase 3 — before participants
      await db.delete(matchAttendanceConfirmationsTable).where(inArray(matchAttendanceConfirmationsTable.id, r.attendanceIds));
    if (r.participantIds.length)
      await db.delete(hostedMatchParticipantsTable).where(inArray(hostedMatchParticipantsTable.id, r.participantIds));
    if (r.reservationIds.length)
      await db.delete(hostedMatchReservationsTable).where(inArray(hostedMatchReservationsTable.id, r.reservationIds));
    if (r.paymentIds.length)
      await db.delete(paymentsTable).where(inArray(paymentsTable.id, r.paymentIds));
    if (r.matchIds.length)
      await db.delete(hostedMatchesTable).where(inArray(hostedMatchesTable.id, r.matchIds));
    if (r.slotIds.length)
      await db.delete(slotsTable).where(inArray(slotsTable.id, r.slotIds));
    if (r.ledgerEntryIds.length)
      await db.delete(walletLedgerTable).where(inArray(walletLedgerTable.id, r.ledgerEntryIds));
    // Phase 5 cleanup
    if (r.rewardEventIds.length)
      await db.delete(rewardEventsTable).where(inArray(rewardEventsTable.id, r.rewardEventIds));
    if (r.referralIds.length)
      await db.delete(referralsTable).where(inArray(referralsTable.id, r.referralIds));
    if (r.venueIds.length)
      await db.delete(venuesTable).where(inArray(venuesTable.id, r.venueIds));
    if (r.profileIds.length)
      await db.delete(profilesTable).where(inArray(profilesTable.id, r.profileIds));
  } catch (err) {
    // If cleanup fails due to foreign key constraints, try again after deleting matches
    // This handles cases where matches were created but not tracked in registry
    if (r.slotIds.length) {
      // Delete any matches using our test slots (orphaned records)
      await db.delete(hostedMatchesTable).where(inArray(hostedMatchesTable.slotId, r.slotIds));
      // Try deleting slots again
      await db.delete(slotsTable).where(inArray(slotsTable.id, r.slotIds));
    }
  }

  // Reset registry
  Object.keys(r).forEach((k) => ((r as any)[k] = []));
}

afterEach(cleanupTestData);

// ─── Seed Helpers ─────────────────────────────────────────────────────────────

export async function seedUser(overrides: Partial<{
  fullName: string;
  email: string;
  clerkId: string;
  walletBalance: string;
  isAdmin: boolean;
}> = {}) {
  const uid = crypto.randomUUID();
  const [profile] = await db.insert(profilesTable).values({
    clerkId: `test_${uid}`,
    fullName: overrides.fullName ?? `Test User ${uid.slice(0, 6)}`,
    email: overrides.email ?? `test_${uid.slice(0, 6)}@matchpit.test`,
    walletBalance: overrides.walletBalance ?? "0",
    isAdmin: overrides.isAdmin ?? false,
  }).returning();
  testRegistry.profileIds.push(profile.id);
  return profile;
}

export async function seedVenue(overrides: Partial<{
  name: string;
  city: string;
  pricePerHour: string;
}> = {}) {
  const [venue] = await db.insert(venuesTable).values({
    name: overrides.name ?? `Test Venue ${crypto.randomUUID().slice(0, 6)}`,
    city: overrides.city ?? "Jaipur",
    address: "Test Address",
    sports: ["football"],
    pricePerHour: overrides.pricePerHour ?? "500",
    weekdayMorningPrice: 500,
    weekdayDayPrice: 600,
    weekdayEveningPrice: 700,
    weekendPrice: 800,
    slotIntervalMins: 60,
    openTime: "06:00",
    closeTime: "23:00",
    isApproved: true,
  }).returning();
  testRegistry.venueIds.push(venue.id);
  return venue;
}

export async function seedSlot(venueId: string, overrides: Partial<{
  date: string;
  startTime: string;
  endTime: string;
  status: "available" | "held" | "booked" | "unavailable";
  isBlockedByOwner: boolean;
}> = {}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  const [slot] = await db.insert(slotsTable).values({
    venueId,
    date: overrides.date ?? dateStr,
    startTime: overrides.startTime ?? "18:00",
    endTime: overrides.endTime ?? "19:00",
    status: overrides.status ?? "available",
    sport: "football",
    priceOverride: "700",
    isBlockedByOwner: overrides.isBlockedByOwner ?? false,
  }).returning();
  testRegistry.slotIds.push(slot.id);
  return slot;
}

export async function seedMatch(hostUserId: string, venueId: string, slotId: string, overrides: Partial<{
  totalPlayers: number;
  minPlayers: number;
  reserveFee: string;
  finalFeePerPlayer: string;
  hostFee: string;
  status: string;
  date: string;
  totalVenueCost: number;
}> = {}) {
  const slot = await db.select().from(slotsTable).where(eq(slotsTable.id, slotId)).limit(1);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [match] = await db.insert(hostedMatchesTable).values({
    hostUserId,
    venueId,
    slotId,
    sport: "football",
    date: overrides.date ?? (slot[0]?.date ?? tomorrow.toISOString().slice(0, 10)),
    startTime: "18:00",
    endTime: "19:00",
    totalPlayers: overrides.totalPlayers ?? 10,
    minPlayers: overrides.minPlayers ?? 6,
    currentPlayers: 0,
    skillLevel: "any",
    hostFee: overrides.hostFee ?? "99",
    reserveFee: overrides.reserveFee ?? "49",
    finalFeePerPlayer: overrides.finalFeePerPlayer ?? "350",
    totalVenueCost: overrides.totalVenueCost ?? 700,
    status: (overrides.status ?? "open") as any,
    financialStatus: "pending",
  }).returning();
  testRegistry.matchIds.push(match.id);
  return match;
}

export async function seedPayment(userId: string, overrides: Partial<{
  type: "booking" | "host_commitment" | "match_reserve" | "match_final" | "match_join" | "refund" | "cashback";
  referenceId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amount: string;
  grossAmount: number;
  status: string;
  reviewStatus: string;
}> = {}) {
  const [payment] = await db.insert(paymentsTable).values({
    userId,
    type: overrides.type ?? "match_reserve",
    referenceId: overrides.referenceId ?? null,
    razorpayOrderId: overrides.razorpayOrderId ?? `order_test_${crypto.randomUUID().slice(0, 8)}`,
    razorpayPaymentId: overrides.razorpayPaymentId ?? null,
    amount: overrides.amount ?? "49",
    grossAmount: overrides.grossAmount ?? 49,
    status: (overrides.status ?? "pending") as any,
    reviewStatus: (overrides.reviewStatus ?? "none") as any,
  }).returning();
  testRegistry.paymentIds.push(payment.id);
  return payment;
}

export async function seedReservation(
  matchId: string,
  userId: string,
  paymentId: string,
  overrides: Partial<{
    reservationStatus: string;
    isActive: boolean;
    paymentOrderId: string;
    expiresAt: Date;
  }> = {}
) {
  const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 7 * 60 * 1000);
  const [reservation] = await db.insert(hostedMatchReservationsTable).values({
    matchId,
    userId,
    paymentId,
    paymentOrderId: overrides.paymentOrderId ?? null,
    reservationStatus: (overrides.reservationStatus ?? "pending_payment") as any,
    isActive: overrides.isActive ?? true,
    expiresAt,
  }).returning();
  testRegistry.reservationIds.push(reservation.id);
  return reservation;
}

export async function seedParticipant(
  matchId: string,
  userId: string,
  overrides: Partial<{
    status: string;
    paymentStatus: string;
    reservePaymentId: string;
    reservePaidAmount: number;
    finalPaymentId: string;
    finalPaidAmount: number;
  }> = {}
) {
  const [participant] = await db.insert(hostedMatchParticipantsTable).values({
    matchId,
    userId,
    status: (overrides.status ?? "reserved") as any,
    paymentStatus: (overrides.paymentStatus ?? "reserve_paid") as any,
    reservePaymentId: overrides.reservePaymentId ?? null,
    reservePaidAmount: overrides.reservePaidAmount ?? 49,
    finalPaymentId: overrides.finalPaymentId ?? null,
    finalPaidAmount: overrides.finalPaidAmount ?? 0,
  }).returning();
  testRegistry.participantIds.push(participant.id);
  return participant;
}

export async function seedPayout(
  venueId: string,
  overrides: Partial<{
    referenceId: string;
    referenceType: string;
    grossAmount: string;
    venuePayable: string;
    status: string;
    paymentId: string;
    payoutType: string;
    settlementBatchId: string;
  }> = {}
) {
  const gross = Number(overrides.grossAmount ?? "700");
  const gatewayFee = gross * 0.02;
  const commission = (gross - gatewayFee) * 0.12;
  const payable = gross - gatewayFee - commission;

  const [payout] = await db.insert(venuePayoutLedgerTable).values({
    venueId,
    referenceId: overrides.referenceId ?? null,
    referenceType: overrides.referenceType ?? "hosted_match",
    grossAmount: (overrides.grossAmount ?? String(gross)).toString(),
    razorpayFee: gatewayFee.toString(),
    platformCommission: commission.toString(),
    venuePayable: (overrides.venuePayable ?? String(payable)).toString(),
    status: (overrides.status ?? "pending") as any,
    paymentId: overrides.paymentId ?? null,
    payoutType: (overrides.payoutType ?? null) as any,
    settlementBatchId: overrides.settlementBatchId ?? null,
  }).returning();
  testRegistry.payoutIds.push(payout.id);
  return payout;
}

/** Convenience: build a complete match scenario */
export async function buildMatchScenario(opts: {
  numPlayers?: number;
  minPlayers?: number;
  reserveFee?: string;
  finalFeePerPlayer?: string;
} = {}) {
  const host = await seedUser({ fullName: "Test Host" });
  const venue = await seedVenue();
  const slot = await seedSlot(venue.id);
  const match = await seedMatch(host.id, venue.id, slot.id, {
    totalPlayers: opts.numPlayers ?? 10,
    minPlayers: opts.minPlayers ?? 4,
    reserveFee: opts.reserveFee ?? "49",
    finalFeePerPlayer: opts.finalFeePerPlayer ?? "350",
  });
  return { host, venue, slot, match };
}
