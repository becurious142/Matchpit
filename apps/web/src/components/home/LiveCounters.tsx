"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface LiveCountersProps {
  stats?: {
    playersJoined: number;
    venues: number;
    matchesHosted: number;
    walletRewardsDistributed: number;
  };
}

function AnimatedCounter({
  target,
  prefix = "",
  suffix = "",
}: {
  target: number;
  prefix?: string;
  suffix?: string;
}) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!isInView) return;
    let startTime: number | null = null;
    const duration = 1100;

    const tick = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [isInView, target]);

  return (
    <span ref={ref}>
      {prefix}
      {value.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

export default function LiveCounters({ stats }: LiveCountersProps) {
  const counters = [
    {
      target: stats?.playersJoined ?? 540,
      prefix: "",
      suffix: "+",
      label: "Players Active",
      sub: "in Jaipur",
      color: "#B6FF3B",
      live: true,
    },
    {
      target: stats?.venues ?? 18,
      prefix: "",
      suffix: "+",
      label: "Premium Venues",
      sub: "listed & live",
      color: "#3B82F6",
      live: false,
    },
    {
      target: stats?.matchesHosted ?? 72,
      prefix: "",
      suffix: "+",
      label: "Matches Hosted",
      sub: "this month",
      color: "#8B5CF6",
      live: false,
    },
    {
      target: stats?.walletRewardsDistributed ?? 15400,
      prefix: "₹",
      suffix: "",
      label: "Rewards Paid",
      sub: "to players",
      color: "#F59E0B",
      live: false,
    },
  ];

  return (
    <section className="border-y border-white/[0.06] bg-[#0B1020]/70 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.06]">
          {counters.map((c, i) => (
            <div
              key={c.label}
              className="flex flex-col items-center text-center px-4 py-3"
            >
              <div className="flex items-center gap-2 mb-1">
                {c.live && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-live-pulse shrink-0 block" />
                )}
                <p
                  className="text-3xl md:text-4xl font-black tracking-tighter tabular-nums"
                  style={{
                    color: c.color,
                    fontFamily: "var(--font-space-grotesk)",
                  }}
                >
                  <AnimatedCounter
                    target={c.target}
                    prefix={c.prefix}
                    suffix={c.suffix}
                  />
                </p>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-foreground/75 mt-0.5">
                {c.label}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
