"use client";

import { useGetVenueSlots } from "@workspace/api-client-react";
import { format, addDays } from "date-fns";
import { Calendar as CalendarIcon, Loader2, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function OwnerCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Hardcoded for demo/structural purposes until Owner Venues API exists
  const venueId = "venue_demo_123";
  
  const from = format(selectedDate, "yyyy-MM-dd");
  const to = format(addDays(selectedDate, 1), "yyyy-MM-dd");

  const { data: slotDays, isLoading } = useGetVenueSlots(venueId, {
    from,
    to,
  });

  const slots = slotDays?.[0]?.slots || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Booking Calendar</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your turf slots and view upcoming matches.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center glass-card rounded-lg border border-white/[0.05] p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium px-4 min-w-[120px] text-center">
              {format(selectedDate, "MMM d, yyyy")}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" className="border-white/[0.05]">
            <Filter className="w-4 h-4 mr-2" /> Filter
          </Button>
        </div>
      </div>

      <div className="flex-1 glass-card rounded-2xl border border-white/[0.05] overflow-hidden flex flex-col">
        {/* Header row */}
        <div className="grid grid-cols-4 bg-[#03040B] border-b border-white/[0.05] p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <div>Time</div>
          <div>Turf 1 (Football)</div>
          <div>Turf 2 (Cricket)</div>
          <div>Turf 3 (Multi)</div>
        </div>

        {/* Time slots grid */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : slots.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <CalendarIcon className="w-12 h-12 mb-4 opacity-20" />
              <p>No slots configured for this date.</p>
            </div>
          ) : (
            // Render actual slots horizontally
            slots.map((slot) => {
              const isBooked = slot.status === "booked";
              return (
                <div key={slot.id} className="grid grid-cols-4 gap-4 items-center">
                  <div className="text-sm font-bold border-r border-white/5 pr-4 py-2">
                    {format(new Date(`${slot.date}T${slot.startTime}`), "h:mm a")}
                  </div>
                  {/* Mocking the columns for structurally sound UI */}
                  <div className={cn(
                    "p-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer",
                    isBooked 
                      ? "bg-red-500/10 border-red-500/20 text-red-400" 
                      : "bg-[#0B1020] border-white/[0.03] text-white/70 hover:bg-white/[0.05]"
                  )}>
                    {isBooked ? "Booked" : `₹${slot.computedPrice ?? slot.priceOverride ?? 1200}`}
                  </div>
                  <div className="p-3 rounded-xl border bg-green-500/10 border-green-500/20 text-green-400 text-sm font-medium">
                    Squad Match (12/14)
                  </div>
                  <div className="p-3 rounded-xl border bg-[#0B1020] border-white/[0.03] text-white/70 text-sm font-medium">
                    Available
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
