import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Metadata } from "next";

// Dynamically import all client-heavy interactive components
const HeroSection        = dynamic(() => import("../components/home/HeroSection"));
const LiveCounters       = dynamic(() => import("../components/home/LiveCounters"));
const SportsFilter       = dynamic(() => import("../components/home/SportsFilter"));
const WalletPromo        = dynamic(() => import("../components/home/WalletPromo"));
const FeaturedVenues     = dynamic(() => import("../components/home/FeaturedVenues"));
const LiveMatchesFeed    = dynamic(() => import("../components/home/LiveMatchesFeed"));
const TournamentsPreview = dynamic(() => import("../components/home/TournamentsPreview"));
const CommunityFeed      = dynamic(() => import("../components/home/CommunityFeed"));
const TeamsClubsStrip    = dynamic(() => import("../components/home/TeamsClubsStrip"));
const ReferralSection    = dynamic(() => import("../components/home/ReferralSection"));

export const metadata: Metadata = {
  title: "Matchpit | Find Your Match. Dominate the Pit.",
  description:
    "The premium marketplace for Gen-Z athletes. Book top-tier turfs, host social matches, and find your squad.",
};

async function getLiveStats() {
  try {
    return {
      playersJoined: 540,
      venues: 18,
      matchesHosted: 72,
      walletRewardsDistributed: 15400,
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  const stats = (await getLiveStats()) || undefined;

  return (
    <div className="flex flex-col min-h-screen w-full">

      {/* ── Hero ── */}
      <HeroSection stats={stats} />

      {/* ── Live City Stats Strip ── */}
      <LiveCounters stats={stats} />

      {/* ── Sports Pill Filter — sticky below nav ── */}
      <SportsFilter />

      {/* ── Main content sections ── */}
      <div className="container mx-auto px-4 py-16 space-y-24">

        {/* Wallet bonus — only for visitors */}
        <Suspense fallback={null}>
          <WalletPromo />
        </Suspense>

        {/* Featured venues */}
        <FeaturedVenues />

        {/* Live / open matches */}
        <LiveMatchesFeed />

        {/* Tournaments preview */}
        <TournamentsPreview />

        {/* Community squad activity */}
        <CommunityFeed />

        {/* Teams & clubs discovery */}
        <TeamsClubsStrip />

        {/* Referral CTA — only for visitors */}
        <Suspense fallback={null}>
          <ReferralSection />
        </Suspense>

      </div>

      {/* ── Venue Owner CTA ── Server component for SEO */}
      <section className="bg-[#050816] border-t border-white/[0.06]">
        <div className="container mx-auto px-4 py-20 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-primary/[0.10] border border-primary/[0.18] rounded-full px-4 py-1.5 mb-6">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                For Venue Owners
              </span>
            </div>
            <h2
              className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-5"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              List Your{" "}
              <span className="text-gradient-lime">Turf.</span>
              <br />
              Earn More.
            </h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed max-w-lg">
              Join Jaipur's fastest-growing sports marketplace. Get bookings from verified players,
              automated payouts, and real-time dashboards — all free to list.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/list-venue">
                <Button
                  size="lg"
                  className="font-bold uppercase tracking-wide h-12 px-8 neon-glow"
                >
                  List Your Venue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/venue-dashboard">
                <Button
                  size="lg"
                  variant="outline"
                  className="font-bold uppercase tracking-wide h-12 px-8 border-white/[0.14] text-foreground hover:bg-white/[0.05] hover:border-white/25"
                >
                  Owner Login
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: "📈", title: "Live Dashboard",   desc: "Track bookings, revenue, and payouts in real-time." },
              { icon: "💸", title: "Instant Payouts",  desc: "Get paid within 24hrs of every confirmed booking." },
              { icon: "🛡️", title: "Verified Players", desc: "All players are ID-verified through Clerk auth." },
              { icon: "📱", title: "Mobile Ready",     desc: "Manage your venue from anywhere, any device." },
            ].map((item) => (
              <div
                key={item.title}
                className="glass-card border border-white/[0.055] rounded-xl p-4 hover:border-primary/[0.18] transition-colors duration-300"
              >
                <div className="text-2xl mb-3">{item.icon}</div>
                <p className="font-bold text-sm mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(160deg, #0B1020 0%, #050816 55%, #0B1020 100%)",
        }}
      >
        {/* Subtle neon glow at top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-24 bg-primary/[0.06] blur-[80px] pointer-events-none" />

        <div className="container mx-auto px-4 py-24 text-center relative z-10">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Ready to compete?
          </p>
          <h2
            className="font-black uppercase tracking-tighter mb-5 text-white"
            style={{
              fontFamily: "var(--font-space-grotesk)",
              fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
              lineHeight: 0.92,
            }}
          >
            Have a squad?
            <br />
            <span className="text-gradient-lime">Build a match.</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-10 text-lg leading-relaxed">
            Book a turf, set the skill level, and split the cost automatically. Host for just ₹99.
          </p>
          <Link href="/tournaments">
            <Button
              size="lg"
              className="font-bold uppercase tracking-wide h-14 px-10 text-lg neon-glow"
            >
              Start Hosting
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

    </div>
  );
}
