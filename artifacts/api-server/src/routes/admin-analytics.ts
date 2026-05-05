import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  analyticsEventsTable,
  profilesTable,
  bookingsTable,
  paymentsTable,
  hostedMatchesTable,
  hostedMatchParticipantsTable,
  walletLedgerTable,
  venuePayoutLedgerTable,
  communityPostsTable,
  notificationDispatchLogsTable,
  userReportsTable,
  userStrikesTable,
  venuesTable,
  squadsTable,
} from "@workspace/db";
import { eq, gte, count, sum, sql, desc, and } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// ─── GET /admin/funnels ───────────────────────────────────────────────────────
router.get("/admin/funnels", requireAdmin, async (req, res) => {
  try {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);

    const [signupsToday] = await db.select({ c: count() }).from(profilesTable).where(gte(profilesTable.createdAt, todayStart));
    const [signupsWeek] = await db.select({ c: count() }).from(profilesTable).where(gte(profilesTable.createdAt, weekStart));
    const [totalProfiles] = await db.select({ c: count() }).from(profilesTable);

    const [bookingEvents] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "booking_started"));
    const [bookingPaidEvents] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "booking_paid"));
    const [hostStarted] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "host_match_started"));
    const [hostPaid] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "host_match_paid"));
    const [reserveStarted] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "reserve_join_started"));
    const [reservePaid] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "reserve_join_paid"));
    const [finalStarted] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "final_payment_started"));
    const [finalPaid] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "final_payment_paid"));
    const [walletUsed] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "wallet_used"));
    const [referralApplied] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "referral_applied"));
    const [communityPosts] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "community_post_created"));
    const [squadCreated] = await db.select({ c: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "squad_created"));

    const pct = (n: number, d: number) => d === 0 ? 0 : Math.round((n / d) * 100 * 10) / 10;

    res.json({
      signupsToday: Number(signupsToday.c),
      signupsWeek: Number(signupsWeek.c),
      totalUsers: Number(totalProfiles.c),
      bookingStarted: Number(bookingEvents.c),
      bookingPaid: Number(bookingPaidEvents.c),
      bookingConversion: pct(Number(bookingPaidEvents.c), Number(bookingEvents.c)),
      hostStarted: Number(hostStarted.c),
      hostPaid: Number(hostPaid.c),
      hostConversion: pct(Number(hostPaid.c), Number(hostStarted.c)),
      reserveStarted: Number(reserveStarted.c),
      reservePaid: Number(reservePaid.c),
      reserveConversion: pct(Number(reservePaid.c), Number(reserveStarted.c)),
      finalStarted: Number(finalStarted.c),
      finalPaid: Number(finalPaid.c),
      finalConversion: pct(Number(finalPaid.c), Number(finalStarted.c)),
      walletUsedCount: Number(walletUsed.c),
      referralConversions: Number(referralApplied.c),
      communityPostsCount: Number(communityPosts.c),
      squadCreatedCount: Number(squadCreated.c),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching funnels");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /admin/kpi ───────────────────────────────────────────────────────────
router.get("/admin/kpi", requireAdmin, async (req, res) => {
  try {
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);

    const [gmvRow] = await db.select({ total: sum(paymentsTable.amount) })
      .from(paymentsTable).where(eq(paymentsTable.status, "success"));

    const [walletLiabilityRow] = await db.select({ total: sum(profilesTable.walletBalance) })
      .from(profilesTable);

    const [unpaidPayoutsRow] = await db.select({ total: sum(venuePayoutLedgerTable.venuePayable) })
      .from(venuePayoutLedgerTable).where(eq(venuePayoutLedgerTable.status, "pending"));

    const [activeUsersRow] = await db.select({ c: count() })
      .from(analyticsEventsTable)
      .where(gte(analyticsEventsTable.createdAt, weekStart));

    const [matchesWeekRow] = await db.select({ c: count() })
      .from(hostedMatchesTable).where(gte(hostedMatchesTable.createdAt, weekStart));

    const [dispatchSentRow] = await db.select({ c: count() })
      .from(notificationDispatchLogsTable).where(eq(notificationDispatchLogsTable.status, "sent"));

    const [suspiciousRow] = await db.select({ c: count() })
      .from(userReportsTable).where(eq(userReportsTable.status, "pending"));

    // Top venues by bookings
    const topVenues = await db.execute(sql`
      SELECT v.name, COUNT(b.id) AS bookings
      FROM venues v
      LEFT JOIN bookings b ON b.venue_id = v.id
      GROUP BY v.id, v.name
      ORDER BY bookings DESC
      LIMIT 5
    `);

    // Top hosts
    const topHosts = await db.execute(sql`
      SELECT p.full_name, COUNT(hm.id) AS matches
      FROM profiles p
      LEFT JOIN hosted_matches hm ON hm.host_user_id = p.id
      GROUP BY p.id, p.full_name
      ORDER BY matches DESC
      LIMIT 5
    `);

    // Top referrers
    const topReferrers = await db.execute(sql`
      SELECT p.full_name, p.referral_code, COUNT(r.id) AS referred
      FROM profiles p
      LEFT JOIN profiles r ON r.referred_by = p.referral_code
      GROUP BY p.id, p.full_name, p.referral_code
      ORDER BY referred DESC
      LIMIT 5
    `);

    // Top community posts
    const topPosts = await db.select({
      id: communityPostsTable.id,
      caption: communityPostsTable.caption,
      likesCount: communityPostsTable.likesCount,
      commentsCount: communityPostsTable.commentsCount,
    })
      .from(communityPostsTable)
      .orderBy(desc(communityPostsTable.likesCount))
      .limit(5);

    // Reserve & final conversion
    const [reserveStarted] = await db.select({ c: count() })
      .from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "reserve_join_started"));
    const [reservePaid] = await db.select({ c: count() })
      .from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "reserve_join_paid"));
    const [finalPaid] = await db.select({ c: count() })
      .from(analyticsEventsTable).where(eq(analyticsEventsTable.eventName, "final_payment_paid"));

    const pct = (n: number, d: number) => d === 0 ? 0 : Math.round((n / d) * 100 * 10) / 10;

    res.json({
      gmv: Number(gmvRow.total ?? 0),
      walletLiabilities: Number(walletLiabilityRow.total ?? 0),
      unpaidPayouts: Number(unpaidPayoutsRow.total ?? 0),
      activeUsersWeek: Number(activeUsersRow.c),
      matchesCreatedWeek: Number(matchesWeekRow.c),
      reserveConversion: pct(Number(reservePaid.c), Number(reserveStarted.c)),
      finalPaymentConversion: pct(Number(finalPaid.c), Number(reservePaid.c)),
      dispatchSentCount: Number(dispatchSentRow.c),
      pendingReportsCount: Number(suspiciousRow.c),
      topVenues: topVenues.rows,
      topHosts: topHosts.rows,
      topReferrers: topReferrers.rows,
      topCommunityPosts: topPosts,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching KPI");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
