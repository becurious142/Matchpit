import { cn } from "@/lib/utils";

const SPORT_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; icon: string }
> = {
  football:   { color: "#3B82F6", bg: "rgba(59,130,246,0.10)",   border: "rgba(59,130,246,0.22)",  icon: "⚽" },
  cricket:    { color: "#F59E0B", bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.22)", icon: "🏏" },
  badminton:  { color: "#8B5CF6", bg: "rgba(139,92,246,0.10)",  border: "rgba(139,92,246,0.22)", icon: "🏸" },
  basketball: { color: "#EF4444", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.22)",  icon: "🏀" },
  tennis:     { color: "#B6FF3B", bg: "rgba(182,255,59,0.10)",  border: "rgba(182,255,59,0.22)", icon: "🎾" },
};

const DEFAULT_CONFIG = {
  color: "#B6FF3B",
  bg: "rgba(182,255,59,0.10)",
  border: "rgba(182,255,59,0.22)",
  icon: "🏆",
};

interface SportBadgeProps {
  sport: string;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

export function SportBadge({
  sport,
  size = "sm",
  showIcon = true,
  className,
}: SportBadgeProps) {
  const config = SPORT_CONFIG[sport.toLowerCase()] ?? DEFAULT_CONFIG;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded-full border",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1",
        className
      )}
      style={{
        color: config.color,
        backgroundColor: config.bg,
        borderColor: config.border,
      }}
    >
      {showIcon && <span className="leading-none">{config.icon}</span>}
      {sport}
    </span>
  );
}
