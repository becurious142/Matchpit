"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Calendar, Clock, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListHostedMatches } from "@workspace/api-client-react";

export default function LiveMatchesFeed() {
  const { data: matchesData, isLoading: loadingMatches } = useListHostedMatches({ status: "open" });

  return (
    <section>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold uppercase italic tracking-tight">Live <span className="text-primary">Matches</span></h2>
        <Link href="/matches" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline uppercase tracking-widest">
          Join Squad <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingMatches ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[220px] w-full rounded-xl" />
          ))
        ) : matchesData?.matches && matchesData.matches.length > 0 ? (
          matchesData.matches.slice(0, 4).map((match: any, i: number) => {
            const spotsLeft = match.totalPlayers - match.currentPlayers;
            const fillPct = (match.currentPlayers / match.totalPlayers) * 100;
            return (
              <Link key={match.id} href={`/matches/${match.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="h-full"
                >
                  <Card className="h-full overflow-hidden group cursor-pointer hover:border-primary transition-colors bg-card/50 backdrop-blur-sm border-border/50 flex flex-col">
                    <div className="p-4 flex-1">
                      <div className="flex justify-between items-start mb-3">
                        <Badge variant="secondary" className="capitalize flex items-center gap-1 font-bold">
                          {match.sport === "football" ? "⚽" : match.sport === "cricket" ? "🏏" : match.sport === "badminton" ? "🏸" : "🏏"}
                          {match.sport}
                        </Badge>
                        {spotsLeft <= 2 ? (
                          <Badge variant="destructive" className="animate-pulse">🔥 {spotsLeft} left</Badge>
                        ) : (
                          <Badge variant="outline" className="border-primary/50 text-primary">Open</Badge>
                        )}
                      </div>

                      <h3 className="font-bold text-lg mb-1 truncate">{match.venue?.name || "Venue"}</h3>

                      <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 shrink-0 text-primary" />
                          <span>{new Date(match.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                        </div>
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-2 shrink-0 text-primary" />
                          <span>{match.startTime} - {match.endTime}</span>
                        </div>
                        <div className="flex items-center">
                          <Trophy className="w-4 h-4 mr-2 shrink-0 text-primary" />
                          <span className="capitalize">{match.skillLevel} Level</span>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.min(fillPct, 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{match.currentPlayers}/{match.totalPlayers} joined</p>
                      </div>
                    </div>

                    <div className="bg-muted/50 p-4 border-t border-border flex items-center justify-between mt-auto">
                      <div className="flex -space-x-2">
                        {Array.from({ length: Math.min(match.currentPlayers, 3) }).map((_, j) => (
                          <div key={j} className="w-8 h-8 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-xs font-bold text-muted-foreground">
                            <Users className="w-3 h-3" />
                          </div>
                        ))}
                        {match.currentPlayers > 3 && (
                          <div className="w-8 h-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary">
                            +{match.currentPlayers - 3}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase block">Reserve</span>
                        <span className="font-bold text-foreground">₹{match.reserveFee || "99"}</span>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              </Link>
            );
          })
        ) : (
          <div className="col-span-full py-16 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border">
            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-bold text-lg">No open matches right now.</p>
            <p className="text-sm mt-1">Be the first to organize one in Jaipur.</p>
          </div>
        )}
      </div>
    </section>
  );
}
