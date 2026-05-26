"use client";

import { useUser } from "@clerk/nextjs";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Compass, Trophy, Zap, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Re-using components from the public marketing page for consistent UX
import LiveMatchesFeed from "@/components/home/LiveMatchesFeed";
import WalletPromo from "@/components/home/WalletPromo";
import CommunityFeed from "@/components/home/CommunityFeed";
import TeamsClubsStrip from "@/components/home/TeamsClubsStrip";

export default function AppHomePage() {
  const { user } = useUser();

  return (
    <div className="flex flex-col gap-10 pb-10">
      {/* Personalized Welcome Header */}
      <section className="px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, <span className="text-primary">{user?.firstName || "Player"}</span>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Here is your personalized sports hub.
        </p>
      </section>

      {/* Wallet Promo / Free Bonus */}
      <section className="px-4">
        <WalletPromo />
      </section>

      {/* Quick Actions */}
      <section className="px-4">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/explore">
            <div className="glass-card p-4 rounded-xl border border-white/[0.05] hover:bg-white/[0.02] transition-colors flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Compass className="w-5 h-5 text-primary" />
              </div>
              <span className="font-semibold text-sm">Find Venues</span>
            </div>
          </Link>
          <Link href="/matches">
            <div className="glass-card p-4 rounded-xl border border-white/[0.05] hover:bg-white/[0.02] transition-colors flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-500" />
              </div>
              <span className="font-semibold text-sm">Join Matches</span>
            </div>
          </Link>
        </div>
      </section>

      {/* Live Matches Feed - Automatically scoped by user location/interest if API supports it */}
      <section>
        <div className="flex items-center justify-between px-4 mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Live Near You
          </h2>
          <Link href="/explore" className="text-sm font-semibold text-primary flex items-center hover:underline">
            View Map <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <Suspense fallback={<div className="h-40 px-4">Loading matches...</div>}>
          <LiveMatchesFeed />
        </Suspense>
      </section>

      {/* Community Feed (Clubs MVP) */}
      <section>
        <div className="px-4 mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            Local Squads
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Activity from clubs in your city</p>
        </div>
        <CommunityFeed />
      </section>

      {/* Teams / Leaderboards */}
      <section className="mb-8">
        <div className="flex items-center justify-between px-4 mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            Top Teams
          </h2>
          <Link href="/teams" className="text-sm font-semibold text-primary flex items-center hover:underline">
            See All <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <TeamsClubsStrip />
      </section>
    </div>
  );
}
