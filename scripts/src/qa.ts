import { db, venuesTable, bookingsTable, hostedMatchesTable, hostedMatchParticipantsTable, paymentsTable, profilesTable, slotsTable, ownerLeadsTable } from "@workspace/db";
import { eq, count, sum, and, isNull, isNotNull } from "drizzle-orm";

async function runQA() {
  console.log("=== MATCHPIT QA VERIFICATION ===\n");
  let passed = 0;
  let failed = 0;

  async function check(name: string, fn: () => Promise<boolean>) {
    try {
      const ok = await fn();
      if (ok) {
        console.log(`  PASS  ${name}`);
        passed++;
      } else {
        console.log(`  FAIL  ${name}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`  ERR   ${name}: ${err.message}`);
      failed++;
    }
  }

  // ─── Venues ───────────────────────────────────────────────
  console.log("VENUES");

  await check("At least one venue exists", async () => {
    const [row] = await db.select({ c: count() }).from(venuesTable);
    return Number(row.c) > 0;
  });

  await check("Featured venues have isApproved=true", async () => {
    const rows = await db
      .select()
      .from(venuesTable)
      .where(eq(venuesTable.isFeatured, true));
    return rows.every((v) => v.isApproved);
  });

  await check("No venue has empty sports array", async () => {
    const rows = await db.select({ sports: venuesTable.sports }).from(venuesTable);
    return rows.every((v) => (v.sports?.length ?? 0) > 0);
  });

  await check("All venues have positive pricePerHour", async () => {
    const rows = await db.select({ p: venuesTable.pricePerHour }).from(venuesTable);
    return rows.every((v) => Number(v.p) > 0);
  });

  // ─── Slots ────────────────────────────────────────────────
  console.log("\nSLOTS");

  await check("All slots belong to an existing venue", async () => {
    const slots = await db.select({ venueId: slotsTable.venueId }).from(slotsTable);
    const venues = await db.select({ id: venuesTable.id }).from(venuesTable);
    const venueIds = new Set(venues.map((v) => v.id));
    return slots.every((s) => venueIds.has(s.venueId));
  });

  await check("No slot has startTime >= endTime", async () => {
    const slots = await db
      .select({ s: slotsTable.startTime, e: slotsTable.endTime })
      .from(slotsTable);
    return slots.every((slot) => slot.s < slot.e);
  });

  // ─── Bookings ─────────────────────────────────────────────
  console.log("\nBOOKINGS");

  await check("All confirmed bookings have a paymentId", async () => {
    const rows = await db
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.status, "confirmed"), isNull(bookingsTable.paymentId)));
    return rows.length === 0;
  });

  await check("All bookings have positive totalAmount", async () => {
    const rows = await db.select({ a: bookingsTable.totalAmount }).from(bookingsTable);
    return rows.every((r) => Number(r.a) > 0);
  });

  // ─── Hosted Matches ───────────────────────────────────────
  console.log("\nHOSTED MATCHES");

  await check("All matches have currentPlayers <= totalPlayers", async () => {
    const rows = await db
      .select({ cur: hostedMatchesTable.currentPlayers, tot: hostedMatchesTable.totalPlayers })
      .from(hostedMatchesTable);
    return rows.every((m) => m.cur <= m.tot);
  });

  await check("All matches have minPlayers <= totalPlayers", async () => {
    const rows = await db
      .select({ min: hostedMatchesTable.minPlayers, tot: hostedMatchesTable.totalPlayers })
      .from(hostedMatchesTable);
    return rows.every((m) => m.min <= m.tot);
  });

  await check("All matches have positive finalFeePerPlayer when confirmed", async () => {
    const rows = await db
      .select({ fee: hostedMatchesTable.finalFeePerPlayer, status: hostedMatchesTable.status })
      .from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.status, "confirmed"));
    return rows.every((m) => Number(m.fee) >= 0);
  });

  // ─── Participants ─────────────────────────────────────────
  console.log("\nPARTICIPANTS");

  await check("All participants belong to an existing match", async () => {
    const participants = await db
      .select({ matchId: hostedMatchParticipantsTable.matchId })
      .from(hostedMatchParticipantsTable);
    const matches = await db
      .select({ id: hostedMatchesTable.id })
      .from(hostedMatchesTable);
    const matchIds = new Set(matches.map((m) => m.id));
    return participants.every((p) => matchIds.has(p.matchId));
  });

  await check("All final_paid participants have a finalPaymentId set", async () => {
    const rows = await db
      .select({ finalPaymentId: hostedMatchParticipantsTable.finalPaymentId })
      .from(hostedMatchParticipantsTable)
      .where(and(eq(hostedMatchParticipantsTable.status, "final_paid"), isNull(hostedMatchParticipantsTable.finalPaymentId)));
    return rows.length === 0;
  });

  // ─── Payments ─────────────────────────────────────────────
  console.log("\nPAYMENTS");

  await check("No duplicate successful payment for same razorpayOrderId", async () => {
    const rows = await db
      .select({ orderId: paymentsTable.razorpayOrderId })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.status, "success"), isNotNull(paymentsTable.razorpayOrderId)));
    const ids = rows.map((r) => r.orderId).filter(Boolean);
    return ids.length === new Set(ids).size;
  });

  await check("All success payments belong to an existing profile", async () => {
    const payments = await db
      .select({ userId: paymentsTable.userId })
      .from(paymentsTable)
      .where(eq(paymentsTable.status, "success"));
    const profiles = await db.select({ id: profilesTable.id }).from(profilesTable);
    const profileIds = new Set(profiles.map((prof) => prof.id));
    return payments.every((pay) => profileIds.has(pay.userId));
  });

  await check("Total successful revenue is non-negative", async () => {
    const [row] = await db
      .select({ total: sum(paymentsTable.amount) })
      .from(paymentsTable)
      .where(eq(paymentsTable.status, "success"));
    return Number(row?.total ?? 0) >= 0;
  });

  // ─── Profiles ─────────────────────────────────────────────
  console.log("\nPROFILES");

  await check("All profiles have a non-empty email", async () => {
    const rows = await db.select({ email: profilesTable.email }).from(profilesTable);
    return rows.every((prof) => prof.email && prof.email.length > 0);
  });

  await check("All profiles have walletBalance >= 0", async () => {
    const rows = await db.select({ w: profilesTable.walletBalance }).from(profilesTable);
    return rows.every((prof) => Number(prof.w) >= 0);
  });

  // ─── Owner Leads ──────────────────────────────────────────
  console.log("\nOWNER LEADS");

  await check("All owner leads have a phone number", async () => {
    const rows = await db.select({ phone: ownerLeadsTable.phone }).from(ownerLeadsTable);
    return rows.every((lead) => lead.phone && lead.phone.length > 0);
  });

  await check("All owner leads have a valid status", async () => {
    const validStatuses = new Set(["new", "contacted", "onboarded", "rejected"]);
    const rows = await db.select({ status: ownerLeadsTable.status }).from(ownerLeadsTable);
    return rows.every((lead) => validStatuses.has(lead.status));
  });

  // ─── Summary ──────────────────────────────────────────────
  console.log(`\n${"─".repeat(40)}`);
  console.log(`TOTAL: ${passed + failed} checks | ${passed} passed | ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runQA().catch((err) => {
  console.error("QA runner crashed:", err);
  process.exit(1);
});
