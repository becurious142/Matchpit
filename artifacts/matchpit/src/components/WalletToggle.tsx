import { Switch } from "@/components/ui/switch";
import { Wallet } from "lucide-react";

interface WalletToggleProps {
  balance: number;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  maxApplicable?: number;
  disabled?: boolean;
}

export function WalletToggle({
  balance,
  enabled,
  onToggle,
  maxApplicable,
  disabled = false,
}: WalletToggleProps) {
  const applicable = maxApplicable !== undefined
    ? Math.min(balance, maxApplicable)
    : balance;

  if (balance <= 0) return null;

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
          <Wallet className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="font-bold text-sm">Use Wallet Balance</p>
          <p className="text-xs text-muted-foreground">
            ₹{balance.toFixed(2)} available
            {enabled && applicable > 0 && (
              <span className="text-primary font-bold ml-1">— saves ₹{applicable.toFixed(2)}</span>
            )}
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
    </div>
  );
}
