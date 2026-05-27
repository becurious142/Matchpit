import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Shield, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMockClubById } from "@/lib/mock-clubs";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const club = getMockClubById(id);
  if (!club) return { title: "Club not found" };
  return {
    title: club.name,
    description: `Join ${club.name} — ${club.sport} club on Matchpit.`,
  };
}

export default async function ClubDetailPage({ params }: PageProps) {
  const { id } = await params;
  const club = getMockClubById(id);

  if (!club) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#050816] pt-24 pb-20">
      <div className="px-4 max-w-3xl mx-auto">
        <Link
          href="/clubs"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          All clubs
        </Link>

        <div className="glass-card rounded-2xl p-8 border border-white/[0.06]">
          <div className="flex items-start gap-5 mb-6">
            <div
              className={`w-16 h-16 rounded-xl bg-gradient-to-br ${club.gradient} flex items-center justify-center text-lg font-black text-white shrink-0`}
            >
              {club.initials}
            </div>
            <div>
              <h1
                className="text-3xl font-black uppercase italic tracking-tight text-white"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                {club.name}
              </h1>
              <p className="text-sm font-bold uppercase tracking-wider mt-1" style={{ color: club.color }}>
                {club.sport}
              </p>
              {club.verified && (
                <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold tracking-widest uppercase text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                  <Shield className="w-3 h-3" />
                  Verified
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 text-center">
              <Users className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
              <p className="text-2xl font-black">{club.members}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Members</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 text-center">
              <Trophy className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
              <p className="text-2xl font-black">{club.wins}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Wins</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 text-center">
              <p className="text-2xl font-black">{club.activeMatches ?? 0}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Active</p>
            </div>
          </div>

          <p className="text-muted-foreground mb-8 leading-relaxed">
            Squad up with players in Jaipur. Club pages are coming soon — matches, chat, and
            leaderboards will live here.
          </p>

          <Button className="w-full font-bold uppercase tracking-wide neon-glow" disabled>
            Join club — coming soon
          </Button>
        </div>
      </div>
    </div>
  );
}
