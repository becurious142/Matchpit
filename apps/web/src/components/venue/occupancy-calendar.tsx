"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function OccupancyCalendar() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hourly Occupancy</CardTitle>
        <CardDescription>Utilization across the day</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full flex items-end justify-between gap-1 mt-4">
          {/* Simulated Bar Chart */}
          {Array.from({ length: 14 }).map((_, i) => {
            const height = Math.floor(Math.random() * 80) + 20;
            const hour = i + 8; // 8 AM to 9 PM
            return (
              <div key={i} className="flex flex-col items-center flex-1 gap-2">
                <div 
                  className={`w-full rounded-t-sm transition-all hover:opacity-80 ${height > 70 ? 'bg-primary' : height > 40 ? 'bg-primary/60' : 'bg-primary/20'}`}
                  style={{ height: `${height}%` }}
                />
                <span className="text-[10px] text-muted-foreground">{hour}:00</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  );
}
