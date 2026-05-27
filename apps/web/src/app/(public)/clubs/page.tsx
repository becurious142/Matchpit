import { Users, Shield, Trophy, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MOCK_CLUBS } from "@/lib/mock-clubs";

export const metadata = {
  title: "Clubs",
  description: "Discover and join local sports clubs in your city.",
};

export default function ClubsPage() {
  return (
    <div className="min-h-screen bg-[#050816] pt-24 pb-20">
      {/* Hero Section */}
      <section className="relative px-4 max-w-7xl mx-auto mb-16">
        <div className="absolute top-0 right-10 w-72 h-72 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
          LOCAL <span className="text-gradient-lime">SQUADS</span>
        </h1>
        <p className="text-muted-foreground mt-4 text-lg max-w-2xl font-medium">
          Find your tribe. Join verified clubs in your city, participate in exclusive matches, and rank up together.
        </p>
        <div className="mt-8 flex gap-4">
          <Button className="bg-primary text-black font-bold hover:bg-primary/90">
            Start a Club
          </Button>
          <Button variant="outline" className="border-white/10">
            Browse All
          </Button>
        </div>
      </section>

      {/* Discovery Grid */}
      <section className="px-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            Trending in Jaipur <MapPin className="w-5 h-5 text-primary" />
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOCK_CLUBS.map((club) => (
            <Link
              key={club.id}
              href={`/clubs/${club.id}`}
              className="glass-card rounded-2xl p-6 border border-white/[0.05] hover:border-primary/30 transition-colors group block"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center shadow-lg">
                  <Users className="w-6 h-6 text-white/70" />
                </div>
                {club.verified && (
                  <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                    <Shield className="w-3 h-3" /> Verified
                  </span>
                )}
              </div>
              
              <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                {club.name}
              </h3>
              <p className="text-primary text-sm font-semibold mb-4">{club.sport}</p>
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-white/50" /> {club.members} Members
                </div>
                {(club.activeMatches ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-500">
                    <Trophy className="w-4 h-4" /> {club.activeMatches} Active Matches
                  </div>
                )}
              </div>

              <span className="flex items-center justify-center w-full py-2 text-sm font-semibold border border-white/10 rounded-md group-hover:bg-white/[0.02] transition-colors">
                View Club <ChevronRight className="w-4 h-4 ml-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
