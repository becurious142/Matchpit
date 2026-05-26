"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy, ChevronRight, Calendar, Users } from "lucide-react";

const MOCK_TOURNAMENTS = [
  {
    id: "1",
    name: "Jaipur Football League",
    sport: "Football",
    date: "Jun 15, 2026",
    teams: "16 Teams",
    prize: "₹25,000",
    status: "Registering",
    color: "#3B82F6",
  },
  {
    id: "2",
    name: "Pink City Cricket Cup",
    sport: "Cricket",
    date: "Jun 22, 2026",
    teams: "8 Teams",
    prize: "₹15,000",
    status: "Open",
    color: "#F59E0B",
  },
  {
    id: "3",
    name: "Smash Championship",
    sport: "Badminton",
    date: "Jul 5, 2026",
    teams: "32 Players",
    prize: "₹10,000",
    status: "Coming Soon",
    color: "#8B5CF6",
  },
];

export default function TournamentsPreview() {
  return (
    <section>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-3.5 h-3.5 text-[#8B5CF6]" />
            <p className="text-xs font-bold uppercase tracking-widest text-[#8B5CF6]">
              Competitive
            </p>
          </div>
          <h2
            className="text-3xl md:text-4xl font-black uppercase tracking-tighter"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Tournaments
          </h2>
        </div>
        <Link
          href="/tournaments"
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest group"
        >
          All Events
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MOCK_TOURNAMENTS.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: i * 0.09 }}
          >
            <Link href={`/tournaments/${t.id}`}>
              <div className="glass-card rounded-xl p-5 border border-white/[0.055] hover:border-[#8B5CF6]/25 transition-all duration-300 hover:-translate-y-0.5 cursor-pointer">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${t.color}14` }}
                  >
                    <Trophy className="w-5 h-5" style={{ color: t.color }} />
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                    style={{
                      color: t.color,
                      borderColor: `${t.color}28`,
                      backgroundColor: `${t.color}10`,
                    }}
                  >
                    {t.status}
                  </span>
                </div>

                <h3 className="font-bold text-base mb-1">{t.name}</h3>
                <p
                  className="text-[11px] font-bold uppercase tracking-wider mb-4"
                  style={{ color: t.color }}
                >
                  {t.sport}
                </p>

                <div className="space-y-2 border-t border-white/[0.055] pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      {t.date}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      {t.teams}
                    </span>
                    <span
                      className="font-black text-base text-primary"
                      style={{ fontFamily: "var(--font-space-grotesk)" }}
                    >
                      {t.prize}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
