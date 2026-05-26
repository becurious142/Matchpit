"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Users, MapPin, Zap, ArrowRight } from "lucide-react";
import { usePostHog } from "posthog-js/react";

interface HeroSectionProps {
  stats?: {
    playersJoined: number;
    venues: number;
    matchesHosted: number;
    walletRewardsDistributed: number;
  };
}

// Floating match cards shown on desktop only — visual social proof
const PREVIEW_MATCHES = [
  {
    sport: "Football",
    venue: "Arena Turf, Vaishali Nagar",
    spotsLeft: 2,
    time: "7:00 PM",
    filled: "8/10",
    color: "#3B82F6",
  },
  {
    sport: "Cricket",
    venue: "Green Park Ground",
    spotsLeft: 4,
    time: "6:30 PM",
    filled: "6/10",
    color: "#F59E0B",
  },
  {
    sport: "Badminton",
    venue: "Smash Courts, C-Scheme",
    spotsLeft: 1,
    time: "8:00 PM",
    filled: "3/4",
    color: "#8B5CF6",
  },
];

export default function HeroSection({ stats }: HeroSectionProps) {
  const posthog = usePostHog();
  const isLive = stats && stats.playersJoined > 10;

  return (
    <section className="relative min-h-[92dvh] md:min-h-[88vh] flex items-center overflow-hidden">

      {/* ── Atmospheric background ── */}
      <div className="absolute inset-0 z-0 bg-[#050816]">
        {/* Stadium-light radial — top center, warm neon, very subtle */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[320px] rounded-full bg-[#B6FF3B]/[0.04] blur-[110px] pointer-events-none" />
        {/* Cool ambient orb — bottom right */}
        <div className="absolute bottom-0 right-0 w-[450px] h-[350px] rounded-full bg-[#3B82F6]/[0.045] blur-[100px] pointer-events-none" />
        {/* Subtle ambient — top left */}
        <div className="absolute top-1/3 -left-24 w-[300px] h-[300px] rounded-full bg-[#8B5CF6]/[0.035] blur-[90px] pointer-events-none" />

        {/* Tactical pitch grid — almost invisible, gives depth */}
        <div
          className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
      </div>

      <div className="container mx-auto px-4 relative z-10 py-24 md:py-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-6 items-center">

          {/* ── Left: Main content ── */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Live badge */}
            <div className="inline-flex items-center gap-2 mb-6 rounded-full px-4 py-1.5 bg-[#EF4444]/10 border border-[#EF4444]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-live-pulse block shrink-0" />
              <span className="text-xs font-bold text-[#EF4444] uppercase tracking-widest">
                {isLive ? "Now Live in Jaipur" : "Launching in Jaipur"}
              </span>
            </div>

            {/* Headline — athletic, condensed, bold */}
            <h1
              className="font-black uppercase leading-[0.88] tracking-tighter mb-6 text-white"
              style={{
                fontFamily: "var(--font-space-grotesk)",
                fontSize: "clamp(3.5rem, 10vw, 6.5rem)",
              }}
            >
              Own The
              <br />
              <span className="text-gradient-lime italic">Pit.</span>
            </h1>

            {/* Subtext */}
            <p className="text-muted-foreground text-lg md:text-xl max-w-md mb-9 leading-relaxed">
              Book premium turfs, build your squad, and compete in Jaipur's sports community.
            </p>

            {/* CTA stack */}
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <Link href="/discover" onClick={() => posthog?.capture("hero_cta_book_turf")}>
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-12 px-8 text-base font-bold uppercase tracking-wide neon-glow"
                >
                  Book a Turf
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/tournaments" onClick={() => posthog?.capture("hero_cta_host_match")}>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 px-8 text-base font-bold uppercase tracking-wide border-white/[0.14] text-foreground hover:bg-white/[0.05] hover:border-white/25 transition-colors"
                >
                  Host a Match
                </Button>
              </Link>
            </div>

            {/* Live stats — locality signal */}
            <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary shrink-0" />
                <span>
                  <strong className="text-foreground font-bold">{stats?.playersJoined ?? 540}+</strong> players active
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#3B82F6] shrink-0" />
                <span>
                  <strong className="text-foreground font-bold">{stats?.venues ?? 18}</strong> premium venues
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#F59E0B] shrink-0" />
                <span>
                  <strong className="text-foreground font-bold">{stats?.matchesHosted ?? 72}+</strong> matches hosted
                </span>
              </div>
            </div>
          </motion.div>

          {/* ── Right: Floating match cards — desktop only ── */}
          <div className="hidden lg:block relative h-[440px]">
            {PREVIEW_MATCHES.map((match, i) => {
              const [current, total] = match.filled.split("/").map(Number);
              const fillPct = (current / total) * 100;

              return (
                <motion.div
                  key={match.sport}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.55,
                    delay: 0.2 + i * 0.14,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="absolute glass-card rounded-2xl p-5 w-[268px] border border-white/[0.07]"
                  style={{
                    top: `${i * 138}px`,
                    right: i === 1 ? "0px" : "44px",
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: match.color }}
                      />
                      <span
                        className="text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: match.color }}
                      >
                        {match.sport}
                      </span>
                    </div>
                    {match.spotsLeft <= 2 ? (
                      <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-full px-2 py-0.5">
                        🔥 {match.spotsLeft} left
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                        Open
                      </span>
                    )}
                  </div>

                  <p className="font-bold text-sm mb-1 truncate">{match.venue}</p>
                  <p className="text-muted-foreground text-xs">
                    {match.time} · {match.filled} joined
                  </p>

                  {/* Fill bar */}
                  <div className="mt-3 w-full bg-white/[0.06] rounded-full h-1 overflow-hidden">
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: `${fillPct}%`,
                        backgroundColor: match.spotsLeft <= 2 ? "#F59E0B" : match.color,
                      }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}
