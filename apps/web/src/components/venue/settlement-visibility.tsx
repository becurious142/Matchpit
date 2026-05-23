"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SettlementVisibility() {
  const settlements = [
    { id: "STL-001", date: "Oct 24, 2023", amount: 45000, status: "processed" },
    { id: "STL-002", date: "Oct 31, 2023", amount: 52000, status: "pending" },
    { id: "STL-003", date: "Nov 07, 2023", amount: 12000, status: "frozen", reason: "Reconciliation discrepancy" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Settlements</CardTitle>
        <CardDescription>Payout history to your registered bank account</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {settlements.map(s => (
            <div key={s.id} className="flex items-center justify-between p-4 border rounded-lg bg-card">
              <div>
                <p className="font-medium">{s.id}</p>
                <p className="text-sm text-muted-foreground">{s.date}</p>
                {s.reason && <p className="text-xs text-destructive mt-1">{s.reason}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-lg">₹{s.amount.toLocaleString()}</p>
                <Badge variant={s.status === 'processed' ? 'default' : s.status === 'pending' ? 'secondary' : 'destructive'} className="mt-1">
                  {s.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
