interface Badge {
  id: string;
  slug: string;
  label: string;
  description: string;
  icon: string;
  earnedAt: string;
}

interface BadgeDisplayProps {
  badges: Badge[];
  compact?: boolean;
}

const BADGE_COLORS: Record<string, string> = {
  early_player: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  reliable_player: "bg-green-500/20 text-green-400 border-green-500/30",
  match_regular: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  power_host: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  fair_host: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  verified_organizer: "bg-primary/20 text-primary border-primary/30",
  no_show_risk: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function BadgeDisplay({ badges, compact = false }: BadgeDisplayProps) {
  if (!badges.length) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {badges.map((b) => (
          <span
            key={b.id}
            title={b.description}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
              BADGE_COLORS[b.slug] ?? "bg-muted text-muted-foreground border-border"
            }`}
          >
            <span>{b.icon}</span>
            <span>{b.label}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {badges.map((b) => (
        <div
          key={b.id}
          className={`flex items-center gap-3 p-3 rounded-xl border ${
            BADGE_COLORS[b.slug] ?? "bg-muted border-border"
          }`}
        >
          <span className="text-2xl">{b.icon}</span>
          <div>
            <p className="font-bold text-sm">{b.label}</p>
            <p className="text-xs opacity-75">{b.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
