"use client";

import { useListMyBookings, useListJoinedMatches, useCancelBooking } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, MapPin, Zap, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function BookingsDashboard() {
  const { data: turfBookings, isLoading: loadingTurfs, refetch: refetchTurfs } = useListMyBookings();
  const { data: joinedMatches, isLoading: loadingMatches } = useListJoinedMatches();
  
  const cancelBooking = useCancelBooking();

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm("Are you sure you want to cancel? Refund policies will apply.")) return;
    
    try {
      await cancelBooking.mutateAsync({ bookingId });
      toast.success("Booking cancelled successfully.");
      refetchTurfs();
    } catch (err) {
      toast.error((err as Error).message || "Failed to cancel booking.");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#050816] px-4 py-6 md:max-w-3xl md:mx-auto w-full pb-20">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Your Bookings</h1>

      <Tabs defaultValue="matches" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-10 bg-[#0B1020] border border-white/[0.05] mb-6">
          <TabsTrigger value="matches" className="text-sm data-[state=active]:bg-white/10">Squad Matches</TabsTrigger>
          <TabsTrigger value="turfs" className="text-sm data-[state=active]:bg-white/10">Private Turfs</TabsTrigger>
        </TabsList>

        <TabsContent value="matches" className="space-y-4">
          {loadingMatches ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
          ) : joinedMatches?.length === 0 ? (
            <div className="text-center py-12 glass-card rounded-2xl border border-white/[0.05]">
              <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">You haven't joined any matches yet.</p>
              <Link href="/matches">
                <Button className="mt-4 bg-primary text-primary-foreground font-bold hover:bg-primary/90 neon-glow">
                  Find Live Matches
                </Button>
              </Link>
            </div>
          ) : (
            joinedMatches?.map((match) => (
              <div key={match.id} className="glass-card p-5 rounded-2xl border border-white/[0.07] flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold tracking-widest uppercase text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded mb-2 inline-block">
                      {match.sport}
                    </span>
                    <h3 className="text-lg font-bold">{match.title}</h3>
                  </div>
                  <span className={cn(
                    "text-xs font-semibold px-2 py-1 rounded",
                    match.status === "open" ? "bg-green-500/10 text-green-500" : "bg-white/10 text-white/70"
                  )}>
                    {match.status}
                  </span>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-white/70" />
                    {format(new Date(match.startTime), "MMM d, h:mm a")}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/[0.05] flex justify-end gap-3">
                  <Link href={`/matches/${match.id}`}>
                    <Button variant="outline" size="sm" className="border-white/10">View Lobby</Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="turfs" className="space-y-4">
          {loadingTurfs ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
          ) : turfBookings?.length === 0 ? (
            <div className="text-center py-12 glass-card rounded-2xl border border-white/[0.05]">
              <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">No private turf bookings.</p>
              <Link href="/explore">
                <Button className="mt-4" variant="outline">Explore Venues</Button>
              </Link>
            </div>
          ) : (
            turfBookings?.map((booking) => (
              <div key={booking.id} className="glass-card p-5 rounded-2xl border border-white/[0.07] flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold">Turf Booking</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> Venue ID: {booking.venueId.substring(0,8)}...
                    </p>
                  </div>
                  <span className={cn(
                    "text-xs font-semibold px-2 py-1 rounded capitalize",
                    booking.status === "confirmed" ? "bg-green-500/10 text-green-500" : 
                    booking.status === "cancelled" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"
                  )}>
                    {booking.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-white/70" />
                    {format(new Date(booking.startTime), "MMM d, h:mm a")} - {format(new Date(booking.endTime), "h:mm a")}
                  </div>
                </div>

                {booking.status === "confirmed" && (
                  <div className="pt-4 border-t border-white/[0.05] flex justify-end">
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="bg-red-500/10 text-red-500 hover:bg-red-500/20"
                      onClick={() => handleCancelBooking(booking.id)}
                    >
                      Cancel Booking
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
