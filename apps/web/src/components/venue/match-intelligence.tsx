"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, AlertTriangle, TrendingUp } from "lucide-react";

export function MatchIntelligence() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Match Intelligence</CardTitle>
        <CardDescription>Key metrics for your venue</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-md">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-medium text-sm">Repeat Customers</h4>
                <p className="text-xs text-muted-foreground">Players returning >2 times</p>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold">42%</div>
              <p className="text-[10px] text-green-500">+4% this month</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 text-destructive rounded-md">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-medium text-sm">Cancellation Rate</h4>
                <p className="text-xs text-muted-foreground">Bookings cancelled < 24h</p>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold">8.4%</div>
              <p className="text-[10px] text-destructive">+1.2% this month</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 text-green-600 rounded-md">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-medium text-sm">Top Sport</h4>
                <p className="text-xs text-muted-foreground">Highest revenue generator</p>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold">Cricket</div>
              <p className="text-[10px] text-muted-foreground">62% of revenue</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
