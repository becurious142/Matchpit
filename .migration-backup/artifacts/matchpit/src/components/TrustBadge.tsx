import { ShieldCheck, ShieldAlert, Shield } from "lucide-react";

interface TrustBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

function getTrustMeta(score: number): { label: string; color: string; bg: string; Icon: React.ComponentType<any> } {
  if (score >= 90) return { label: "Elite", color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", Icon: ShieldCheck };
  if (score >= 75) return { label: "Reliable", color: "text-primary", bg: "bg-primary/10 border-primary/30", Icon: ShieldCheck };
  if (score >= 50) return { label: "Average", color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30", Icon: Shield };
  return { label: "Low Trust", color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", Icon: ShieldAlert };
}

const sizes = {
  sm: { container: "px-2 py-0.5 text-[10px] gap-1", icon: "w-3 h-3" },
  md: { container: "px-3 py-1 text-xs gap-1.5", icon: "w-3.5 h-3.5" },
  lg: { container: "px-4 py-2 text-sm gap-2", icon: "w-4 h-4" },
};

export function TrustBadge({ score, size = "md", showLabel = true }: TrustBadgeProps) {
  const meta = getTrustMeta(score);
  const { container, icon } = sizes[size];
  const { Icon } = meta;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold ${container} ${meta.bg} ${meta.color}`}
      title={`Trust Score: ${score}/100`}
    >
      <Icon className={icon} />
      {showLabel && <span>{meta.label}</span>}
      <span className="font-mono">{Math.round(score)}</span>
    </span>
  );
}

interface TrustScoreBarProps {
  score: number;
  noShowCount?: number;
  completedBookings?: number;
  cancelledBookings?: number;
}

export function TrustScoreBar({ score, noShowCount = 0, completedBookings = 0, cancelledBookings = 0 }: TrustScoreBarProps) {
  const meta = getTrustMeta(score);

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Reliability Score</p>
          <p className="text-4xl font-extrabold">{Math.round(score)}<span className="text-lg text-muted-foreground">/100</span></p>
        </div>
        <TrustBadge score={score} size="lg" />
      </div>

      <div className="relative h-3 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            score >= 90 ? "bg-green-500" : score >= 75 ? "bg-primary" : score >= 50 ? "bg-yellow-500" : "bg-destructive"
          }`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 pt-1">
        <div className="text-center">
          <p className="text-lg font-bold text-green-500">{completedBookings}</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Completed</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-muted-foreground">{cancelledBookings}</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Cancelled</p>
        </div>
        <div className="text-center">
          <p className={`text-lg font-bold ${noShowCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>{noShowCount}</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">No-shows</p>
        </div>
      </div>
    </div>
  );
}
