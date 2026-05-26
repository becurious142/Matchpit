"use client";

import { useWalletStore } from "@/store/walletStore";
import { useListPaymentHistory } from "@workspace/api-client-react";
import { useAppUIStore } from "@/store/uiStore";
import { Button } from "@/components/ui/button";
import { IndianRupee, ArrowDownLeft, ArrowUpRight, Plus, Loader2, History } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function WalletLedgerPage() {
  const balance = useWalletStore((s) => s.balance);
  const openCheckout = useAppUIStore((s) => s.openCheckout);

  const { data: history, isLoading } = useListPaymentHistory();

  const handleTopUp = () => {
    openCheckout({
      amount: 500, // Default top-up amount, ideally let user type it
      currency: "INR",
      type: "wallet_topup",
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#050816] px-4 py-6 md:max-w-2xl md:mx-auto w-full">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Wallet Ledger</h1>

      {/* Main Balance Card */}
      <div className="glass-card rounded-2xl p-6 border border-primary/20 relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-[40px] pointer-events-none" />
        
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Available Balance</p>
        <div className="text-5xl font-black text-white flex items-center mb-6">
          <IndianRupee className="w-8 h-8 mr-1 text-primary" />
          {balance}
        </div>

        <Button 
          onClick={handleTopUp}
          className="w-full bg-white text-black hover:bg-white/90 font-bold tracking-wider"
        >
          <Plus className="w-5 h-5 mr-2" /> Add Money
        </Button>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-muted-foreground" />
          Recent Transactions
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : history?.length === 0 ? (
          <div className="text-center py-10 glass-card rounded-xl border border-white/[0.05]">
            <p className="text-muted-foreground">No transactions yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history?.map((tx) => {
              const isCredit = tx.amount > 0;
              return (
                <div key={tx.id} className="glass-card p-4 rounded-xl border border-white/[0.05] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      isCredit ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {isCredit ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white capitalize">{tx.type.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(tx.createdAt), "MMM d, h:mm a")}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "font-bold text-base flex items-center",
                    isCredit ? "text-green-500" : "text-white"
                  )}>
                    {isCredit ? "+" : "-"}<IndianRupee className="w-3.5 h-3.5 mx-0.5" />{Math.abs(tx.amount)}
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
