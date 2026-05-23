"use client";

import { motion } from "framer-motion";
import { Users, Star, Trophy, Wallet } from "lucide-react";

interface LiveCountersProps {
  stats?: {
    playersJoined: number;
    venues: number;
    matchesHosted: number;
    walletRewardsDistributed: number;
  };
}

export default function LiveCounters({ stats }: LiveCountersProps) {
  const trustStats = [
    {
      value: stats && stats.playersJoined > 0 ? `${stats.playersJoined}+` : "500+",
      label: "Players Active",
      icon: <Users className="w-6 h-6" />,
    },
    {
      value: stats && stats.venues > 0 ? `${stats.venues}+` : "15+",
      label: "Premium Venues",
      icon: <Star className="w-6 h-6" />,
    },
    {
      value: stats && stats.matchesHosted > 0 ? `${stats.matchesHosted}+` : "50+",
      label: "Matches Hosted",
      icon: <Trophy className="w-6 h-6" />,
    },
    {
      value: stats && stats.walletRewardsDistributed > 0
        ? `₹${Math.round(stats.walletRewardsDistributed)}`
        : "₹50+",
      label: "Rewards Distributed",
      icon: <Wallet className="w-6 h-6" />,
    },
  ];

  return (
    <section className="border-y border-border/40 bg-card/20 backdrop-blur-sm py-6">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {trustStats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="flex flex-col items-center text-center"
            >
              <div className="text-primary mb-2">{stat.icon}</div>
              <p className="text-2xl md:text-3xl font-extrabold text-primary">{stat.value}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-0.5">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
