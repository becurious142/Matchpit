import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Wallet, TrendingUp, TrendingDown, Gift, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { format, parseISO } from "date-fns";

interface LedgerEntry {
  id: string;
  type: "credit" | "debit";
  reason: string;
  amount: number;
  balanceAfter: number;
  referenceId: string | null;
  createdAt: string;
}

interface RewardEvent {
  id: string;
  eventType: string;
  amount: number;
  notes: string | null;
  createdAt: string;
}

interface WalletData {
  balance: number;
  walletAutoUse: boolean;
  totalEarned: number;
  totalSpent: number;
  ledger: LedgerEntry[];
  rewards: RewardEvent[];
}

const REWARD_LABELS: Record<string, string> = {
  signup_bonus: "Signup Bonus",
  referral_referrer: "Referral Reward",
  referral_referee: "Welcome Referral Credit",
  first_booking_cashback: "First Booking Cashback",
  first_match_cashback: "First Match Cashback",
  underfill_refund: "Match Underfill Refund",
  cancellation_refund: "Cancellation Refund",
  admin_credit: "Admin Credit",
  admin_debit: "Admin Debit",
};

export default function WalletPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet, isLoading } = useQuery<WalletData>({
    queryKey: ["wallet"],
    queryFn: async () => {
      const res = await fetch("/api/wallet");
      if (!res.ok) throw new Error("Failed to fetch wallet");
      return res.json();
    },
  });

  const toggleAutoUse = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/profile/wallet-auto-use", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAutoUse: enabled }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      toast({ title: "Updated", description: "Wallet auto-use setting saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!wallet) return null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-8">
        My <span className="text-primary">Wallet</span>
      </h1>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-primary/20 to-card border-primary/30 mb-6 shadow-xl shadow-primary/10">
        <CardContent className="p-8">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-6 h-6 text-primary" />
            <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Available Balance</span>
          </div>
          <div className="text-5xl font-extrabold text-primary mb-6">
            ₹{wallet.balance.toFixed(2)}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-background/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-400 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-bold uppercase">Total Earned</span>
              </div>
              <p className="text-xl font-bold">₹{wallet.totalEarned.toFixed(2)}</p>
            </div>
            <div className="bg-background/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-400 mb-1">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs font-bold uppercase">Total Spent</span>
              </div>
              <p className="text-xl font-bold">₹{wallet.totalSpent.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-background/40 rounded-xl border border-border/50">
            <div>
              <p className="font-bold text-sm">Auto-apply wallet at checkout</p>
              <p className="text-xs text-muted-foreground">Automatically use wallet balance when paying</p>
            </div>
            <Switch
              checked={wallet.walletAutoUse}
              onCheckedChange={(checked) => toggleAutoUse.mutate(checked)}
              disabled={toggleAutoUse.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Reward Events */}
      {wallet.rewards.length > 0 && (
        <Card className="bg-card/50 border-border/50 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold uppercase tracking-wider">
              <Gift className="w-4 h-4 text-primary" />
              Rewards Earned
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="space-y-3">
              {wallet.rewards.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{REWARD_LABELS[r.eventType] ?? r.eventType}</p>
                    {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(parseISO(r.createdAt), "dd MMM yyyy, h:mm a")}
                    </p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    +₹{r.amount}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction History */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold uppercase tracking-wider">Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {wallet.ledger.length === 0 ? (
            <div className="text-center py-12">
              <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
              <p className="text-muted-foreground font-medium">No transactions yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Book a turf or join a match to get started.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {wallet.ledger.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 py-3 border-b border-border/30 last:border-0"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    entry.type === "credit"
                      ? "bg-green-500/15 text-green-400"
                      : "bg-red-500/15 text-red-400"
                  }`}>
                    {entry.type === "credit"
                      ? <ArrowDownLeft className="w-4 h-4" />
                      : <ArrowUpRight className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{entry.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(entry.createdAt), "dd MMM yyyy, h:mm a")}
                      {" · "}Balance after: ₹{entry.balanceAfter.toFixed(2)}
                    </p>
                  </div>
                  <span className={`font-bold text-sm shrink-0 ${
                    entry.type === "credit" ? "text-green-400" : "text-red-400"
                  }`}>
                    {entry.type === "credit" ? "+" : "-"}₹{entry.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
