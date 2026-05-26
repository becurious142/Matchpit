"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";

// Static activity feed — reflects squad culture & locality
const FEED_ITEMS = [
  {
    id: "1",
    initials: "RK",
    gradient: "from-[#3B82F6] to-[#8B5CF6]",
    user: "Rahul K.",
    action: "joined a football match",
    venue: "Arena Turf, Vaishali",
    time: "2m ago",
    sport: "Football",
    sportColor: "#3B82F6",
  },
  {
    id: "2",
    initials: "PS",
    gradient: "from-[#F59E0B] to-[#EF4444]",
    user: "Priya S.",
    action: "hosted a cricket match",
    venue: "Green Park Ground",
    time: "9m ago",
    sport: "Cricket",
    sportColor: "#F59E0B",
  },
  {
    id: "3",
    initials: "TM",
    gradient: "from-[#8B5CF6] to-[#3B82F6]",
    user: "Team Mavericks",
    action: "won the weekend tournament",
    venue: "Pro Courts, C-Scheme",
    time: "17m ago",
    sport: "Badminton",
    sportColor: "#8B5CF6",
  },
  {
    id: "4",
    initials: "AM",
    gradient: "from-[#B6FF3B] to-[#3B82F6]",
    user: "Arjun M.",
    action: "joined a cricket match",
    venue: "Jaipur Cricket Academy",
    time: "25m ago",
    sport: "Cricket",
    sportColor: "#F59E0B",
  },
  {
    id: "5",
    initials: "KR",
    gradient: "from-[#EF4444] to-[#F59E0B]",
    user: "Kabir R.",
    action: "created a squad game",
    venue: "Urban Kick, Malviya",
    time: "38m ago",
    sport: "Football",
    sportColor: "#3B82F6",
  },
];

export default function CommunityFeed() {
  return (
    <section>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-live-pulse block shrink-0" />
            <p className="text-xs font-bold uppercase tracking-widest text-[#3B82F6]">
              Community
            </p>
          </div>
          <h2
            className="text-3xl md:text-4xl font-black uppercase tracking-tighter"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Squad Activity
          </h2>
        </div>
      </div>

      {/* Horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
        {FEED_ITEMS.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.38, delay: i * 0.07 }}
            className="glass-card rounded-xl p-4 border border-white/[0.055] hover:border-white/[0.10] transition-colors shrink-0 w-52 md:w-auto"
          >
            {/* Avatar */}
            <div
              className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.gradient} flex items-center justify-center text-xs font-black text-white mb-3 select-none`}
            >
              {item.initials}
            </div>

            {/* Activity text */}
            <p className="text-sm leading-snug">
              <strong className="font-bold text-foreground">{item.user}</strong>{" "}
              <span className="text-muted-foreground font-normal">{item.action}</span>
            </p>

            {/* Venue */}
            <div className="flex items-center gap-1 text-muted-foreground text-xs mt-2">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{item.venue}</span>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.055]">
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: item.sportColor }}
              >
                {item.sport}
              </span>
              <span className="text-[10px] text-muted-foreground">{item.time}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
