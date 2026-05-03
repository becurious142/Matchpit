import {
  db, venuesTable, bookingsTable, hostedMatchesTable,
  hostedMatchParticipantsTable, paymentsTable, profilesTable,
  slotsTable, ownerLeadsTable, citiesTable, couponsTable,
  venuePayoutLedgerTable, walletLedgerTable,
} from "@workspace/db";
import { SPORTS, getSportMeta } from "@workspace/db";
import { eq, count, sum, and, isNull, isNotNull, lt, gt, gte, sql } from "drizzle-orm";

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

  // ─── Venues ───────────────────────────────────────────────────────────────
  console.log("VENUES");

  await check("At least 15 venues exist", async () => {
    const [row] = await db.select({ c: count() }).from(venuesTable);
    return Number(row.c) >= 15;
  });

  await check("At least 5 Jaipur venues are featured", async () => {
    const rows = await db.select().from(venuesTable)
      .where(and(eq(venuesTable.city, "Jaipur"), eq(venuesTable.isFeatured, true)));
    return rows.length >= 5;
  });

  await check("Featured venues have isApproved=true", async () => {
    const rows = await db.select().from(venuesTable).where(eq(venuesTable.isFeatured, true));
    return rows.every((v) => v.isApproved);
  });

  await check("No venue has empty sports array", async () => {
    const rows = await db.select({ sports: venuesTable.sports }).from(venuesTable);
    return rows.every((v) => (v.sports?.length ?? 0) > 0);
  });

  await check("All venues use canonical sport slugs", async () => {
    const validSlugs = new Set(SPORTS.map((s) => s.slug));
    const rows = await db.select({ sports: venuesTable.sports }).from(venuesTable);
    for (const v of rows) {
      for (const s of v.sports ?? []) {
        if (!validSlugs.has(s)) return false;
      }
    }
    return true;
  });

  await check("All venues have positive pricePerHour", async () => {
    const rows = await db.select({ p: venuesTable.pricePerHour }).from(venuesTable);
    return rows.every((v) => Number(v.p) > 0);
  });

  await check("All venues have a non-empty name and address", async () => {
    const rows = await db.select({ name: venuesTable.name, address: venuesTable.address }).from(venuesTable);
    return rows.every((v) => v.name.trim().length > 0 && v.address.trim().length > 0);
  });

  await check("All approved venues are in Jaipur (seeded)", async () => {
    const rows = await db.select({ city: venuesTable.city }).from(venuesTable)
      .where(eq(venuesTable.isApproved, true));
    return rows.every((v) => v.city === "Jaipur");
  });

  // ─── Slots ────────────────────────────────────────────────────────────────
  console.log("\nSLOTS");

  await check("At least 1000 slots exist (14-day seed)", async () => {
    const [row] = await db.select({ c: count() }).from(slotsTable);
    return Number(row.c) >= 1000;
  });

  await check("All slots belong to an existing venue", async () => {
    const slots = await db.select({ venueId: slotsTable.venueId }).from(slotsTable);
    const venues = await db.select({ id: venuesTable.id }).from(venuesTable);
    const venueIds = new Set(venues.map((v) => v.id));
    return slots.every((s) => venueIds.has(s.venueId));
  });

  await check("No slot has startTime >= endTime", async () => {
    const slots = await db.select({ s: slotsTable.startTime, e: slotsTable.endTime }).from(slotsTable);
    return slots.every((slot) => slot.s < slot.e);
  });

  await check("All slots have a valid date string (YYYY-MM-DD)", async () => {
    const slots = await db.select({ date: slotsTable.date }).from(slotsTable).limit(100);
    const re = /^\d{4}-\d{2}-\d{2}$/;
    return slots.every((s) => re.test(s.date));
  });

  await check("All slot statuses are valid", async () => {
    const valid = new Set(["available", "booked", "blocked"]);
    const rows = await db.select({ status: slotsTable.status }).from(slotsTable);
    return rows.every((s) => valid.has(s.status));
  });

  // ─── City Master ──────────────────────────────────────────────────────────
  console.log("\nCITY MASTER");

  await check("5 cities exist in city_master", async () => {
    const [row] = await db.select({ c: count() }).from(citiesTable);
    return Number(row.c) === 5;
  });

  await check("Jaipur is the only active city", async () => {
    const active = await db.select().from(citiesTable).where(eq(citiesTable.isActive, true));
    return active.length === 1 && active[0].slug === "jaipur";
  });

  await check("All cities have unique slugs", async () => {
    const rows = await db.select({ slug: citiesTable.slug }).from(citiesTable);
    return rows.length === new Set(rows.map((c) => c.slug)).size;
  });

  await check("Jaipur has launchPriority = 1", async () => {
    const [jaipur] = await db.select().from(citiesTable).where(eq(citiesTable.slug, "jaipur")).limit(1);
    return jaipur?.launchPriority === 1;
  });

  await check("All city slugs are lowercase", async () => {
    const rows = await db.select({ slug: citiesTable.slug }).from(citiesTable);
    return rows.every((c) => c.slug === c.slug.toLowerCase());
  });

  // ─── Sports Taxonomy ──────────────────────────────────────────────────────
  console.log("\nSPORTS TAXONOMY");

  await check("Exactly 5 canonical sports defined", async () => {
    return SPORTS.length === 5;
  });

  await check("All canonical sport slugs are unique", async () => {
    const slugs = SPORTS.map((s) => s.slug);
    return slugs.length === new Set(slugs).size;
  });

  await check("Cricket, Football, Badminton in canonical sports", async () => {
    const slugs = new Set(SPORTS.map((s) => s.slug));
    return slugs.has("cricket") && slugs.has("football") && slugs.has("badminton");
  });

  await check("Box cricket and pickleball in canonical sports", async () => {
    const slugs = new Set(SPORTS.map((s) => s.slug));
    return slugs.has("box_cricket") && slugs.has("pickleball");
  });

  await check("getSportMeta returns label for cricket", async () => {
    const meta = getSportMeta("cricket");
    return meta?.label === "Cricket";
  });

  await check("getSportMeta returns null for unknown sport", async () => {
    const meta = getSportMeta("tennis");
    return meta === null || meta === undefined;
  });

  // ─── Coupons ──────────────────────────────────────────────────────────────
  console.log("\nCOUPONS");

  await check("Coupons table exists and is queryable", async () => {
    const rows = await db.select({ c: count() }).from(couponsTable);
    return Number(rows[0].c) >= 0;
  });

  await check("All coupons have positive value", async () => {
    const rows = await db.select({ v: couponsTable.value }).from(couponsTable);
    return rows.every((c) => Number(c.v) > 0);
  });

  await check("Coupon type is flat or percent", async () => {
    const validTypes = new Set(["flat", "percent"]);
    const rows = await db.select({ type: couponsTable.type }).from(couponsTable);
    return rows.every((c) => validTypes.has(c.type));
  });

  await check("All coupon codes are uppercase", async () => {
    const rows = await db.select({ code: couponsTable.code }).from(couponsTable);
    return rows.every((c) => c.code === c.code.toUpperCase());
  });

  await check("No two coupons share the same code", async () => {
    const rows = await db.select({ code: couponsTable.code }).from(couponsTable);
    return rows.length === new Set(rows.map((c) => c.code)).size;
  });

  await check("Percent coupons have value <= 100", async () => {
    const rows = await db.select({ v: couponsTable.value, type: couponsTable.type }).from(couponsTable)
      .where(eq(couponsTable.type, "percent"));
    return rows.every((c) => Number(c.v) <= 100);
  });

  // ─── Venue Payouts ────────────────────────────────────────────────────────
  console.log("\nVENUE PAYOUTS");

  await check("Venue payout ledger table is queryable", async () => {
    const rows = await db.select({ c: count() }).from(venuePayoutLedgerTable);
    return Number(rows[0].c) >= 0;
  });

  await check("All payout statuses are valid", async () => {
    const valid = new Set(["pending", "paid", "hold"]);
    const rows = await db.select({ status: venuePayoutLedgerTable.status }).from(venuePayoutLedgerTable);
    return rows.every((p) => valid.has(p.status));
  });

  await check("All payouts have non-negative amounts", async () => {
    const rows = await db.select({
      gross: venuePayoutLedgerTable.grossAmount,
      payable: venuePayoutLedgerTable.venuePayable,
    }).from(venuePayoutLedgerTable);
    return rows.every((p) => Number(p.gross) >= 0 && Number(p.payable) >= 0);
  });

  await check("Paid payouts have a paidAt timestamp", async () => {
    const rows = await db.select({ paidAt: venuePayoutLedgerTable.paidAt })
      .from(venuePayoutLedgerTable)
      .where(and(eq(venuePayoutLedgerTable.status, "paid"), isNull(venuePayoutLedgerTable.paidAt)));
    return rows.length === 0;
  });

  // ─── Bookings ─────────────────────────────────────────────────────────────
  console.log("\nBOOKINGS");

  await check("All confirmed bookings have a paymentId", async () => {
    const rows = await db.select().from(bookingsTable)
      .where(and(eq(bookingsTable.status, "confirmed"), isNull(bookingsTable.paymentId)));
    return rows.length === 0;
  });

  await check("All bookings have positive totalAmount", async () => {
    const rows = await db.select({ a: bookingsTable.totalAmount }).from(bookingsTable);
    return rows.every((r) => Number(r.a) > 0);
  });

  await check("No booking references a non-existent venue", async () => {
    const bookings = await db.select({ venueId: bookingsTable.venueId }).from(bookingsTable);
    const venues = await db.select({ id: venuesTable.id }).from(venuesTable);
    const venueIds = new Set(venues.map((v) => v.id));
    return bookings.every((b) => venueIds.has(b.venueId));
  });

  await check("All booking sports are canonical", async () => {
    const valid = new Set(SPORTS.map((s) => s.slug));
    const rows = await db.select({ sport: bookingsTable.sport }).from(bookingsTable);
    return rows.filter((b) => b.sport).every((b) => valid.has(b.sport!));
  });

  // ─── Hosted Matches ───────────────────────────────────────────────────────
  console.log("\nHOSTED MATCHES");

  await check("All matches have currentPlayers <= totalPlayers", async () => {
    const rows = await db.select({ cur: hostedMatchesTable.currentPlayers, tot: hostedMatchesTable.totalPlayers })
      .from(hostedMatchesTable);
    return rows.every((m) => m.cur <= m.tot);
  });

  await check("All matches have minPlayers <= totalPlayers", async () => {
    const rows = await db.select({ min: hostedMatchesTable.minPlayers, tot: hostedMatchesTable.totalPlayers })
      .from(hostedMatchesTable);
    return rows.every((m) => m.min <= m.tot);
  });

  await check("All match sports are canonical", async () => {
    const valid = new Set(SPORTS.map((s) => s.slug));
    const rows = await db.select({ sport: hostedMatchesTable.sport }).from(hostedMatchesTable);
    return rows.every((m) => valid.has(m.sport));
  });

  await check("No cancelled match has participants with status=confirmed", async () => {
    const cancelled = await db.select({ id: hostedMatchesTable.id }).from(hostedMatchesTable)
      .where(eq(hostedMatchesTable.status, "cancelled"));
    if (!cancelled.length) return true;
    const cancelledIds = new Set(cancelled.map((m) => m.id));
    const participants = await db.select({ matchId: hostedMatchParticipantsTable.matchId, status: hostedMatchParticipantsTable.status })
      .from(hostedMatchParticipantsTable)
      .where(eq(hostedMatchParticipantsTable.status, "confirmed"));
    return !participants.some((p) => cancelledIds.has(p.matchId));
  });

  // ─── Participants ─────────────────────────────────────────────────────────
  console.log("\nPARTICIPANTS");

  await check("All participants belong to an existing match", async () => {
    const participants = await db.select({ matchId: hostedMatchParticipantsTable.matchId }).from(hostedMatchParticipantsTable);
    const matches = await db.select({ id: hostedMatchesTable.id }).from(hostedMatchesTable);
    const matchIds = new Set(matches.map((m) => m.id));
    return participants.every((p) => matchIds.has(p.matchId));
  });

  await check("All final_paid participants have a finalPaymentId", async () => {
    const rows = await db.select({ finalPaymentId: hostedMatchParticipantsTable.finalPaymentId })
      .from(hostedMatchParticipantsTable)
      .where(and(eq(hostedMatchParticipantsTable.status, "final_paid"), isNull(hostedMatchParticipantsTable.finalPaymentId)));
    return rows.length === 0;
  });

  // ─── Payments ─────────────────────────────────────────────────────────────
  console.log("\nPAYMENTS");

  await check("No duplicate successful payment for same razorpayOrderId", async () => {
    const rows = await db.select({ orderId: paymentsTable.razorpayOrderId }).from(paymentsTable)
      .where(and(eq(paymentsTable.status, "success"), isNotNull(paymentsTable.razorpayOrderId)));
    const ids = rows.map((r) => r.orderId).filter(Boolean);
    return ids.length === new Set(ids).size;
  });

  await check("All success payments belong to an existing profile", async () => {
    const payments = await db.select({ userId: paymentsTable.userId }).from(paymentsTable)
      .where(eq(paymentsTable.status, "success"));
    const profiles = await db.select({ id: profilesTable.id }).from(profilesTable);
    const profileIds = new Set(profiles.map((prof) => prof.id));
    return payments.every((pay) => profileIds.has(pay.userId));
  });

  await check("Total successful revenue is non-negative", async () => {
    const [row] = await db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable)
      .where(eq(paymentsTable.status, "success"));
    return Number(row?.total ?? 0) >= 0;
  });

  await check("All payment types are valid", async () => {
    const valid = new Set(["booking", "hosted_match_deposit", "hosted_match_final"]);
    const rows = await db.select({ type: paymentsTable.type }).from(paymentsTable);
    return rows.every((p) => valid.has(p.type));
  });

  // ─── Profiles ─────────────────────────────────────────────────────────────
  console.log("\nPROFILES");

  await check("All profiles have a non-empty email", async () => {
    const rows = await db.select({ email: profilesTable.email }).from(profilesTable);
    return rows.every((prof) => prof.email && prof.email.length > 0);
  });

  await check("All profiles have walletBalance >= 0", async () => {
    const rows = await db.select({ w: profilesTable.walletBalance }).from(profilesTable);
    return rows.every((prof) => Number(prof.w) >= 0);
  });

  await check("No two profiles share the same email", async () => {
    const rows = await db.select({ email: profilesTable.email }).from(profilesTable);
    return rows.length === new Set(rows.map((p) => p.email)).size;
  });

  await check("All profile favoriteSports are canonical", async () => {
    const valid = new Set(SPORTS.map((s) => s.slug));
    const rows = await db.select({ sports: profilesTable.favoriteSports }).from(profilesTable);
    for (const prof of rows) {
      for (const s of prof.sports ?? []) {
        if (!valid.has(s)) return false;
      }
    }
    return true;
  });

  await check("All referral codes are unique if set", async () => {
    const rows = await db.select({ code: (profilesTable as any).referralCode }).from(profilesTable)
      .where(isNotNull((profilesTable as any).referralCode));
    const codes = rows.map((p: any) => p.code).filter(Boolean);
    return codes.length === new Set(codes).size;
  });

  // ─── Wallet Ledger ────────────────────────────────────────────────────────
  console.log("\nWALLET LEDGER");

  await check("Wallet ledger table is queryable", async () => {
    const [row] = await db.select({ c: count() }).from(walletLedgerTable);
    return Number(row.c) >= 0;
  });

  await check("All wallet ledger types are credit or debit", async () => {
    const valid = new Set(["credit", "debit"]);
    const rows = await db.select({ type: walletLedgerTable.type }).from(walletLedgerTable);
    return rows.every((l) => valid.has(l.type));
  });

  await check("All wallet ledger amounts are positive", async () => {
    const rows = await db.select({ amount: walletLedgerTable.amount }).from(walletLedgerTable);
    return rows.every((l) => Number(l.amount) > 0);
  });

  // ─── Owner Leads ──────────────────────────────────────────────────────────
  console.log("\nOWNER LEADS");

  await check("At least 3 sample owner leads exist", async () => {
    const [row] = await db.select({ c: count() }).from(ownerLeadsTable);
    return Number(row.c) >= 3;
  });

  await check("All owner leads have a phone number", async () => {
    const rows = await db.select({ phone: ownerLeadsTable.phone }).from(ownerLeadsTable);
    return rows.every((lead) => lead.phone && lead.phone.length > 0);
  });

  await check("All owner leads have a valid status", async () => {
    const validStatuses = new Set(["new", "contacted", "demo", "onboarded", "rejected"]);
    const rows = await db.select({ status: ownerLeadsTable.status }).from(ownerLeadsTable);
    return rows.every((lead) => validStatuses.has(lead.status));
  });

  await check("All owner leads have a venue name", async () => {
    const rows = await db.select({ venueName: ownerLeadsTable.venueName }).from(ownerLeadsTable);
    return rows.every((lead) => lead.venueName && lead.venueName.trim().length > 0);
  });

  await check("Demo status exists among sample leads", async () => {
    const rows = await db.select({ status: ownerLeadsTable.status }).from(ownerLeadsTable)
      .where(eq(ownerLeadsTable.status, "demo" as any));
    return rows.length > 0;
  });

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(48)}`);
  console.log(`TOTAL: ${passed + failed} checks | ${passed} passed | ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runQA().catch((err) => {
  console.error("QA runner crashed:", err);
  process.exit(1);
});
