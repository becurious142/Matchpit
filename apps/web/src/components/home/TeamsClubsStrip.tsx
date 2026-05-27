"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Users } from "lucide-react";
import { MOCK_CLUBS } from "@/lib/mock-clubs";

export default function TeamsClubsStrip() {
  return (
    <section>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Find Your People
            </p>
          </div>
          <h2
            className="text-3xl md:text-4xl font-black uppercase tracking-tighter"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Teams & Clubs
          </h2>
        </div>
        <Link
          href="/clubs"
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest group"
        >
          Browse All
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 fade-edges">
        {MOCK_CLUBS.map((club, i) => (
          <motion.div
            key={club.id}
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.38, delay: i * 0.07 }}
            className="shrink-0"
          >
            <Link href={`/clubs/${club.id}`}>
              <div className="glass-card rounded-xl p-5 border border-white/[0.055] hover:border-white/[0.10] transition-all duration-300 hover:-translate-y-0.5 cursor-pointer w-44">
                {/* Club avatar */}
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${club.gradient} flex items-center justify-center text-sm font-black text-white mb-4 select-none`}
                >
                  {club.initials}
                </div>

                <h3 className="font-bold text-sm mb-0.5 truncate">{club.name}</h3>
                <p
                  className="text-[10px] font-bold uppercase tracking-wider mb-4"
                  style={{ color: club.color }}
                >
                  {club.sport}
                </p>

                <div className="flex items-center justify-between border-t border-white/[0.055] pt-3">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Users className="w-3 h-3" />
                    <span>{club.members}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    {club.wins}W
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
