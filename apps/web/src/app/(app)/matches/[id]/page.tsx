"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useGetHostedMatch } from "@workspace/api-client-react";
import { useMatchPresenceStore } from "@/store/matchPresenceStore";
import { useAppUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Clock, MapPin, Calendar as CalendarIcon, Shield, Loader2, IndianRupee } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function MatchLobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  // Realtime Presence via Zustand (populated by SSE)
  const presence = useMatchPresenceStore((s) => s.activeMatches[id]);
  const activeViewers = presence?.activeViewers || 1;
  
  // Checkout Orchestration
  const openCheckout = useAppUIStore((s) => s.openCheckout);
  const { userId } = useAuthStore();

  // Fetch Match Details
  const { data: match, isLoading, error } = useGetHostedMatch(id, {
    query: {
      refetchInterval: 30000, // Poll every 30s as fallback to realtime
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050816]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#050816] text-white p-6 text-center">
        <p className="text-destructive mb-4">Failed to load match lobby.</p>
        <Button onClick={() => router.back()} variant="outline">Go Back</Button>
      </div>
    );
  }

  const spotsTotal = match.maxPlayers;
  // Use realtime participants if available, fallback to fetched data
  const spotsFilled = presence?.joinedParticipants ?? match.participants?.length ?? 0;
  const spotsLeft = Math.max(0, spotsTotal - spotsFilled);
  const isFull = spotsLeft === 0;

  // Determine if the current user is already in the match
  const isJoined = match.participants?.some(p => p.profileId === userId);

  const handleJoin = () => {
    if (!userId) {
      router.push(`/sign-in?redirect_url=/matches/${id}`);
      return;
    }
    
    // Trigger global checkout orchestration for the reserve fee
    openCheckout({
      matchId: id,
      venueId: match.venueId,
      amount: match.costPerPlayer,
      currency: "INR",
      type: "reserve",
    });
  };

  return (
    <div className="min-h-screen bg-[#050816] pb-24">
      {/* Dynamic Header */}
      <div className="sticky top-14 z-30 bg-[#050816]/95 backdrop-blur-md border-b border-white/[0.06] p-4 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-white/70 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2 bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-full border border-primary/20">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          {activeViewers} viewing now
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-6 mt-4">
        {/* Match Identity */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-widest uppercase text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded">
              {match.sport}
            </span>
            <span className={cn(
              "text-xs font-bold tracking-widest uppercase px-2 py-1 rounded",
              match.status === "open" ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20"
            )}>
              {match.status}
            </span>
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter italic" style={{ fontFamily: "var(--font-space-grotesk)" }}>
            {match.title}
          </h1>
        </div>

        {/* Core Details Glass Card */}
        <div className="glass-card p-5 rounded-2xl border border-white/[0.07] space-y-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <CalendarIcon className="w-5 h-5 text-white/70" />
            <span className="text-white font-medium">{format(new Date(match.startTime), "EEEE, MMM d, yyyy")}</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Clock className="w-5 h-5 text-amber-500" />
            <span className="text-white font-medium">{format(new Date(match.startTime), "h:mm a")} - {format(new Date(match.endTime), "h:mm a")}</span>
          </div>
          <div className="flex items-start gap-3 text-muted-foreground">
            <MapPin className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-medium">Turf Location</p>
              <p className="text-sm">Click map to view exact venue details</p>
            </div>
          </div>
        </div>

        {/* Roster & Spots */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users className="w-5 h-5" /> Squad Roster
            </h2>
            <span className={cn(
              "text-sm font-bold",
              spotsLeft <= 2 ? "text-red-400 animate-pulse" : "text-primary"
            )}>
              {spotsFilled}/{spotsTotal} Filled
            </span>
          </div>
          
          <div className="glass-card p-4 rounded-xl border border-white/[0.05]">
            <div className="flex flex-wrap gap-2">
              {/* Render joined participants */}
              {match.participants?.map((p, i) => (
                <div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 border-2 border-[#0B1020] flex items-center justify-center shadow-lg">
                  <span className="text-xs font-bold text-white uppercase">{p.profileId.substring(0, 2)}</span>
                </div>
              ))}
              
              {/* Render empty spots */}
              {Array.from({ length: spotsLeft }).map((_, i) => (
                <div key={`empty-${i}`} className="w-10 h-10 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                  <span className="text-white/20 text-xs">+</span>
                </div>
              ))}
            </div>
            
            {spotsLeft <= 2 && !isFull && (
              <p className="text-xs text-red-400 mt-3 font-semibold flex items-center gap-1">
                🔥 Hurry! Only {spotsLeft} spot{spotsLeft > 1 ? 's' : ''} left!
              </p>
            )}
          </div>
        </div>

        {/* Pricing & Guarantee */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-primary font-bold uppercase tracking-wider">Reserve Fee</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pay balance at venue</p>
          </div>
          <div className="text-2xl font-black text-white flex items-center">
            <IndianRupee className="w-5 h-5 mr-0.5" />
            {match.costPerPlayer}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-4">
          <Shield className="w-4 h-4 text-green-500" />
          <span>100% Refundable up to 2 hours before kickoff</span>
        </div>
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-[#050816]/95 backdrop-blur-xl border-t border-white/[0.06] z-40 md:static md:bg-transparent md:border-none md:p-0 md:max-w-xl md:mx-auto mt-8">
        {isJoined ? (
          <Button disabled className="w-full h-14 font-black uppercase tracking-wider text-base bg-white/10 text-white">
            You are in the squad ✓
          </Button>
        ) : isFull ? (
          <Button disabled className="w-full h-14 font-black uppercase tracking-wider text-base bg-red-500/20 text-red-400 border border-red-500/30">
            Match is Full
          </Button>
        ) : (
          <Button 
            onClick={handleJoin}
            className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-black uppercase tracking-wider text-base shadow-[0_0_30px_rgba(200,241,53,0.3)]"
          >
            Join Squad · ₹{match.costPerPlayer}
          </Button>
        )}
      </div>
    </div>
  );
}
