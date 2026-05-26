"use client";

import { useListPaymentHistory } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Loader2, IndianRupee, ArrowDownLeft, ArrowUpRight, Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function OwnerPayoutsPage() {
  const { data: history, isLoading } = useListPaymentHistory();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Ledger</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track your venue payouts, settled matches, and withdrawals.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-white/[0.05]">
            <Filter className="w-4 h-4 mr-2" /> Filter
          </Button>
          <Button variant="outline" className="border-white/[0.05]">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="glass-card p-5 rounded-2xl border border-white/[0.05]">
          <p className="text-sm font-medium text-muted-foreground mb-1">Available for Payout</p>
          <div className="text-3xl font-black text-white flex items-center">
            <IndianRupee className="w-6 h-6 mr-1 text-primary" />
            24,500
          </div>
          <Button className="w-full mt-4 bg-primary text-black hover:bg-primary/90 font-bold">
            Withdraw Funds
          </Button>
        </div>
        <div className="glass-card p-5 rounded-2xl border border-white/[0.05]">
          <p className="text-sm font-medium text-muted-foreground mb-1">Next Settlement</p>
          <div className="text-2xl font-bold text-white mb-1">Tomorrow, 9 AM</div>
          <p className="text-sm text-green-400">Est. ₹12,000</p>
        </div>
        <div className="glass-card p-5 rounded-2xl border border-white/[0.05]">
          <p className="text-sm font-medium text-muted-foreground mb-1">Total Earned (YTD)</p>
          <div className="text-2xl font-bold text-white flex items-center mb-1">
            <IndianRupee className="w-5 h-5 mr-1" />
            4,52,000
          </div>
          <p className="text-sm text-muted-foreground">Across 128 bookings</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-white/[0.05] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.05] bg-[#03040B]">
          <h3 className="font-bold">Transaction History</h3>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : history?.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No transactions found.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {history?.map((tx) => {
              const isCredit = tx.amount > 0;
              return (
                <div key={tx.id} className="p-4 sm:px-6 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      isCredit ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {isCredit ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-white capitalize">{tx.type.replace(/_/g, " ")}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{format(new Date(tx.createdAt), "MMM d, yyyy h:mm a")}</span>
                        <span>•</span>
                        <span className="font-mono">{tx.id.substring(0,8)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      "font-bold text-base flex items-center justify-end",
                      isCredit ? "text-green-500" : "text-white"
                    )}>
                      {isCredit ? "+" : "-"}<IndianRupee className="w-3.5 h-3.5 mx-0.5" />{Math.abs(tx.amount)}
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold tracking-wider uppercase mt-1 inline-block",
                      tx.status === "success" ? "text-green-500" : "text-amber-500"
                    )}>
                      {tx.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
