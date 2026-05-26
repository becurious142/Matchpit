"use client";

import { useGetMyProfile } from "@workspace/api-client-react";
import { Loader2, TrendingUp, Users, Calendar, IndianRupee } from "lucide-react";
import { format } from "date-fns";

export default function OwnerOverviewPage() {
  const { data: profile, isLoading } = useGetMyProfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Temporary mock data structurally ready for real API
  const metrics = [
    { label: "Today's Revenue", value: "₹12,450", trend: "+14%", icon: IndianRupee },
    { label: "Active Bookings", value: "34", trend: "+5%", icon: Calendar },
    { label: "Total Players", value: "128", trend: "+12%", icon: Users },
    { label: "Utilization", value: "78%", trend: "+2%", icon: TrendingUp },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Welcome back, {profile?.fullName || "Venue Owner"}. Here's what's happening today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="glass-card p-5 rounded-2xl border border-white/[0.05]">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <m.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                {m.trend}
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white">{m.value}</h3>
              <p className="text-sm text-muted-foreground mt-1 font-medium">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-card rounded-2xl border border-white/[0.05] p-6 h-[400px] flex flex-col items-center justify-center text-center">
          <TrendingUp className="w-10 h-10 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-bold text-white mb-1">Revenue Analytics</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Detailed charting will appear here once the analytics API is fully deployed in Phase E.
          </p>
        </div>

        <div className="glass-card rounded-2xl border border-white/[0.05] p-6">
          <h3 className="text-lg font-bold text-white mb-4">Today's Schedule</h3>
          <div className="space-y-4">
            {/* Mock Schedule items structurally ready */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 p-3 rounded-xl bg-[#0B1020] border border-white/[0.03]">
                <div className="flex flex-col items-center justify-center px-3 border-r border-white/5">
                  <span className="text-xs font-bold text-primary">PM</span>
                  <span className="text-lg font-black">{5 + i}:00</span>
                </div>
                <div className="flex-1 py-1">
                  <p className="text-sm font-bold text-white">Turf {i} Booking</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Football • 14 Players</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
