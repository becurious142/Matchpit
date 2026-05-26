import { Calendar, Users, IndianRupee, MapPin, ChevronRight, Swords } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Tournaments",
  description: "Find and register for local sports tournaments.",
};

const MOCK_TOURNAMENTS = [
  { id: 1, title: "Jaipur Premier League", sport: "Cricket", date: "Next Weekend", prize: "₹50,000", spots: 2, total: 16, status: "Registering" },
  { id: 2, title: "Midnight Turf Wars", sport: "Football", date: "Sat, 8 PM", prize: "₹10,000", spots: 0, total: 8, status: "Full" },
  { id: 3, title: "City Smash Open", sport: "Badminton", date: "In 2 Weeks", prize: "₹25,000", spots: 12, total: 32, status: "Registering" },
];

export default function TournamentsPage() {
  return (
    <div className="min-h-screen bg-[#050816] pt-24 pb-20">
      <section className="relative px-4 max-w-7xl mx-auto mb-16">
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none" />
        
        <Swords className="w-16 h-16 text-amber-500 mb-6 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
          UPCOMING <span className="text-amber-500">TOURNAMENTS</span>
        </h1>
        <p className="text-muted-foreground mt-4 text-lg max-w-2xl font-medium">
          High stakes. Big prizes. Aggregate your squad and compete in the city's top hosted events.
        </p>
      </section>

      <section className="px-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {MOCK_TOURNAMENTS.map((tourney) => (
            <div key={tourney.id} className="glass-card rounded-2xl border border-white/[0.05] overflow-hidden flex flex-col group hover:border-amber-500/30 transition-all">
              <div className="h-32 bg-[#0B1020] relative flex items-center justify-center border-b border-white/[0.05]">
                {/* Placeholder for tournament banner image */}
                <Swords className="w-12 h-12 text-white/10" />
                <div className="absolute top-4 right-4">
                  <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded ${
                    tourney.status === "Registering" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    {tourney.status}
                  </span>
                </div>
              </div>
              
              <div className="p-6 flex-1 flex flex-col">
                <div className="mb-4">
                  <p className="text-amber-500 text-xs font-bold uppercase tracking-wider mb-1">{tourney.sport}</p>
                  <h3 className="text-xl font-bold text-white">{tourney.title}</h3>
                </div>

                <div className="space-y-3 mb-6 flex-1">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4 text-white/50" /> {tourney.date}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <IndianRupee className="w-4 h-4 text-white/50" /> Prize Pool: {tourney.prize}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Users className="w-4 h-4 text-white/50" /> 
                    {tourney.spots === 0 ? "Registration Closed" : `${tourney.spots} Team Spots Left (out of ${tourney.total})`}
                  </div>
                </div>

                <Button 
                  disabled={tourney.spots === 0}
                  className={`w-full font-bold uppercase tracking-wider ${
                    tourney.spots === 0 
                      ? "bg-white/5 text-white/30" 
                      : "bg-amber-500 text-black hover:bg-amber-600"
                  }`}
                >
                  {tourney.spots === 0 ? "Closed" : "Register Team"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
