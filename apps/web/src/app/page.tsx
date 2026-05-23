import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Metadata } from "next";

// Dynamically import client-heavy interactive components
const HeroSection = dynamic(() => import("../components/home/HeroSection"));
const LiveCounters = dynamic(() => import("../components/home/LiveCounters"));
const SportsFilter = dynamic(() => import("../components/home/SportsFilter"));
const FeaturedVenues = dynamic(() => import("../components/home/FeaturedVenues"));
const LiveMatchesFeed = dynamic(() => import("../components/home/LiveMatchesFeed"));
const WalletPromo = dynamic(() => import("../components/home/WalletPromo"));

export const metadata: Metadata = {
  title: "Matchpit | Find Your Match. Dominate the Pit.",
  description: "The premium marketplace for Gen-Z athletes. Book top-tier turfs, host social matches, and find your squad.",
};

async function getLiveStats() {
  try {
    // In a real server component, we would fetch directly from our internal API or database
    // For now, we pass mock initial data which will be hydrated
    return {
      playersJoined: 540,
      venues: 18,
      matchesHosted: 72,
      walletRewardsDistributed: 15400,
    };
  } catch (e) {
    return null;
  }
}

export default async function Home() {
  const stats = await getLiveStats() || undefined;

  return (
    <div className="flex flex-col min-h-screen w-full">
      {/* Hero Section */}
      <HeroSection stats={stats} />

      {/* Live Jaipur Counters */}
      <LiveCounters stats={stats} />

      {/* Sports Filter Strip */}
      <SportsFilter />

      <div className="container mx-auto px-4 py-16 space-y-24">
        {/* Wallet Promo Banner */}
        <WalletPromo />

        {/* Featured Venues */}
        <FeaturedVenues />

        {/* Live Matches Feed */}
        <LiveMatchesFeed />

      </div>

      {/* Owner CTA Strip - Kept as Server Component for SEO */}
      <section className="mt-8 bg-card/60 border-t border-border/50">
        <div className="container mx-auto px-4 py-20 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/30">For Venue Owners</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold uppercase italic tracking-tighter mb-4">
              List Your <span className="text-primary">Turf</span>. Earn More.
            </h2>
            <p className="text-muted-foreground text-lg mb-6">
              Join Jaipur's fastest-growing sports marketplace. Get bookings from verified players, automated payouts, and real-time dashboards — all free to list.
            </p>
            <div className="flex gap-4">
              <Link href="/list-venue">
                <Button size="lg" className="font-bold uppercase italic h-12 px-8">List Your Venue</Button>
              </Link>
              <Link href="/venue-dashboard">
                <Button size="lg" variant="outline" className="font-bold uppercase italic h-12 px-8 border-primary/30 text-primary hover:bg-primary/5">Owner Login</Button>
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: "📈", title: "Live Dashboard", desc: "Track bookings, revenue, and payouts in real-time." },
              { icon: "💸", title: "Instant Payouts", desc: "Get paid within 24hrs of every confirmed booking." },
              { icon: "🛡️", title: "Verified Players", desc: "All players are ID-verified through Clerk auth." },
              { icon: "📱", title: "Mobile Ready", desc: "Manage your venue from anywhere, any device." },
            ].map((item) => (
              <div key={item.title} className="bg-card border border-border/50 rounded-xl p-4 hover:border-primary/50 transition-colors">
                <div className="text-2xl mb-2">{item.icon}</div>
                <p className="font-bold text-sm mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Strip */}
      <section className="bg-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold uppercase italic tracking-tighter mb-4 text-black">
            Have a squad? Build a match.
          </h2>
          <p className="text-black/80 max-w-2xl mx-auto mb-8 text-lg font-medium">
            Book a turf, set the skill level, and split the cost automatically. Host for just ₹99.
          </p>
          <Link href="/tournaments">
            <Button size="lg" variant="outline" className="bg-black text-primary hover:bg-black/90 border-transparent text-lg font-bold h-14 px-8 uppercase italic">
              Start Hosting
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
