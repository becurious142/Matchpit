"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Calendar, Clock, Zap, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useListHostedMatches } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

// Sport identity system — color + icon
const SPORT_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  football:  { color: "#3B82F6", bg: "rgba(59,130,246,0.10)",  icon: "⚽" },
  cricket:   { color: "#F59E0B", bg: "rgba(245,158,11,0.10)", icon: "🏏" },
  badminton: { color: "#8B5CF6", bg: "rgba(139,92,246,0.10)", icon: "🏸" },
  basketball:{ color: "#EF4444", bg: "rgba(239,68,68,0.10)",  icon: "🏀" },
  tennis:    { color: "#B6FF3B", bg: "rgba(182,255,59,0.10)", icon: "🎾" },
};

const DEFAULT_SPORT = { color: "#B6FF3B", bg: "rgba(182,255,59,0.10)", icon: "🏆" };

// Gradient avatar palette
const AVATAR_GRADIENTS = [
  "from-[#3B82F6] to-[#8B5CF6]",
  "from-[#F59E0B] to-[#EF4444]",
  "from-[#B6FF3B] to-[#3B82F6]",
  "from-[#8B5CF6] to-[#EF4444]",
];

export default function LiveMatchesFeed() {
  const { data: matchesData, isLoading: loadingMatches } = useListHostedMatches({
    status: "open",
  });

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-live-pulse block shrink-0" />
            <p className="text-xs font-bold uppercase tracking-widest text-[#EF4444]">
              Live Now
            </p>
          </div>
          <h2
            className="text-3xl md:text-4xl font-black uppercase tracking-tighter"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Open Matches
          </h2>
        </div>
        <Link
          href="/matches"
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest group"
        >
          Join Squad
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingMatches ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/[0.05] overflow-hidden">
              <Skeleton className="h-[224px] w-full bg-white/[0.04]" />
            </div>
          ))
        ) : matchesData?.matches && matchesData.matches.length > 0 ? (
          matchesData.matches.slice(0, 4).map((match: any, i: number) => {
            const spotsLeft = match.totalPlayers - match.currentPlayers;
            const fillPct = (match.currentPlayers / match.totalPlayers) * 100;
            const sport = SPORT_CONFIG[match.sport?.toLowerCase()] ?? DEFAULT_SPORT;
            const isUrgent = spotsLeft <= 2;

            return (
              <Link key={match.id} href={`/matches/${match.id}`}>
                <motion.article
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className={cn(
                    "glass-card rounded-xl overflow-hidden group cursor-pointer h-full flex flex-col border transition-all duration-300 hover:-translate-y-1",
                    isUrgent
                      ? "border-[#F59E0B]/[0.18] hover:border-[#F59E0B]/35"
                      : "border-white/[0.055] hover:border-primary/[0.20]"
                  )}
                >
                  <div className="p-4 flex-1">
                    {/* Sport chip + Status */}
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: sport.color, backgroundColor: sport.bg }}
                      >
                        <span>{sport.icon}</span>
                        {match.sport}
                      </div>

                      {isUrgent ? (
                        <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-full px-2 py-0.5 flex items-center gap-1">
                          🔥 {spotsLeft} left
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                          Open
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-base mb-3 truncate">
                      {match.venue?.name ?? "Venue"}
                    </h3>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: sport.color }} />
                        <span>
                          {new Date(match.date).toLocaleDateString("en-IN", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: sport.color }} />
                        <span>
                          {match.startTime} – {match.endTime}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: sport.color }} />
                        <span className="capitalize">{match.skillLevel}</span>
                      </div>
                    </div>

                    {/* Squad fill bar */}
                    <div className="mt-4">
                      <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(fillPct, 100)}%`,
                            backgroundColor: isUrgent ? "#F59E0B" : sport.color,
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {match.currentPlayers}/{match.totalPlayers} joined
                      </p>
                    </div>
                  </div>

                  {/* Card footer: avatars + reserve fee */}
                  <div className="px-4 py-3 border-t border-white/[0.055] flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {Array.from({ length: Math.min(match.currentPlayers, 4) }).map((_, j) => (
                        <div
                          key={j}
                          className={cn(
                            "w-7 h-7 rounded-full border-2 border-[#0B1020] bg-gradient-to-br flex items-center justify-center",
                            AVATAR_GRADIENTS[j % AVATAR_GRADIENTS.length]
                          )}
                        >
                          <Users className="w-3 h-3 text-white/80" />
                        </div>
                      ))}
                      {match.currentPlayers > 4 && (
                        <div className="w-7 h-7 rounded-full border-2 border-[#0B1020] bg-white/[0.08] flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                          +{match.currentPlayers - 4}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                        Reserve
                      </span>
                      <span
                        className="font-black text-sm text-foreground"
                        style={{ fontFamily: "var(--font-space-grotesk)" }}
                      >
                        ₹{match.reserveFee ?? "99"}
                      </span>
                    </div>
                  </div>
                </motion.article>
              </Link>
            );
          })
        ) : (
          <div className="col-span-full py-16 text-center rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02]">
            <Zap className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-25" />
            <p className="font-bold text-lg text-muted-foreground">No open matches right now.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Be the first to organize one in Jaipur.
            </p>
            <Link
              href="/tournaments"
              className="mt-4 inline-flex items-center gap-1.5 text-primary hover:underline text-sm font-bold"
            >
              Host a Match →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
