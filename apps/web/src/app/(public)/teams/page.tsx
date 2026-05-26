import { Trophy, ChevronRight, Zap, Target } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Teams & Leaderboards",
  description: "View top ranking teams and active squads on Matchpit.",
};

const MOCK_TEAMS = [
  { rank: 1, name: "Night Owls FC", sport: "Football", winRate: "82%", matches: 45, pts: 135 },
  { rank: 2, name: "Desert Strikers", sport: "Football", winRate: "76%", matches: 50, pts: 120 },
  { rank: 3, name: "Pink City Titans", sport: "Cricket", winRate: "88%", matches: 20, pts: 95 },
  { rank: 4, name: "Court Kings", sport: "Basketball", winRate: "65%", matches: 30, pts: 80 },
  { rank: 5, name: "Shuttle Ninjas", sport: "Badminton", winRate: "92%", matches: 15, pts: 60 },
];

export default function TeamsPage() {
  return (
    <div className="min-h-screen bg-[#050816] pt-24 pb-20">
      <section className="relative px-4 max-w-5xl mx-auto mb-16 text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        
        <Trophy className="w-16 h-16 text-primary mx-auto mb-6 drop-shadow-[0_0_15px_rgba(200,241,53,0.5)]" />
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
          GLOBAL <span className="text-gradient-lime">LEADERBOARDS</span>
        </h1>
        <p className="text-muted-foreground mt-4 text-lg max-w-2xl mx-auto font-medium">
          Compete in ranked matches, climb the ladders, and prove your squad is the best in the city.
        </p>
      </section>

      <section className="px-4 max-w-5xl mx-auto">
        <div className="glass-card rounded-2xl border border-white/[0.05] overflow-hidden">
          <div className="grid grid-cols-12 bg-[#0B1020] border-b border-white/[0.05] p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center md:text-left">
            <div className="col-span-2 md:col-span-1">Rank</div>
            <div className="col-span-10 md:col-span-5 text-left">Team</div>
            <div className="hidden md:block md:col-span-2">Sport</div>
            <div className="hidden md:block md:col-span-2">Win Rate</div>
            <div className="hidden md:block md:col-span-2">Points</div>
          </div>

          <div className="divide-y divide-white/[0.02]">
            {MOCK_TEAMS.map((team) => (
              <div key={team.rank} className="grid grid-cols-12 items-center p-4 hover:bg-white/[0.02] transition-colors group">
                <div className="col-span-2 md:col-span-1 flex justify-center md:justify-start">
                  <span className={`text-lg font-black ${
                    team.rank === 1 ? "text-amber-400" :
                    team.rank === 2 ? "text-slate-300" :
                    team.rank === 3 ? "text-amber-700" : "text-white/50"
                  }`}>
                    #{team.rank}
                  </span>
                </div>
                
                <div className="col-span-10 md:col-span-5 flex items-center justify-between md:justify-start gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">
                      {team.name}
                    </h3>
                    <p className="text-xs text-muted-foreground md:hidden">{team.sport} • {team.pts} pts</p>
                  </div>
                </div>

                <div className="hidden md:flex md:col-span-2 items-center text-sm font-medium text-white/70">
                  {team.sport}
                </div>

                <div className="hidden md:flex md:col-span-2 items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  <span className="font-bold">{team.winRate}</span>
                </div>

                <div className="hidden md:flex md:col-span-2 items-center justify-between">
                  <span className="font-black text-lg text-white">{team.pts}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">Want to see your squad on the leaderboard?</p>
          <Link href="/sign-up">
            <Button className="bg-white text-black hover:bg-white/90 font-bold">
              Register Your Team
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
