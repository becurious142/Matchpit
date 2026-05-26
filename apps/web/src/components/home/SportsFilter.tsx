"use client";

import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useListSports } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export default function SportsFilter() {
  const { data: sportsData, isLoading: loadingSports } = useListSports();
  const [active, setActive] = useState<string | null>(null);

  return (
    <section className="border-b border-white/[0.06] bg-[#0B1020]/85 backdrop-blur-sm sticky top-16 z-40">
      <div className="container mx-auto px-4">
        <div className="flex gap-2.5 overflow-x-auto py-3 scrollbar-hide fade-edges">
          {loadingSports ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-9 w-28 rounded-full shrink-0 bg-white/[0.05]"
              />
            ))
          ) : (
            sportsData?.map((sport) => (
              <Link
                key={sport.slug}
                href={`/discover?sport=${sport.slug}`}
                onClick={() => setActive(sport.slug)}
                className={cn(
                  "flex items-center gap-2 h-9 px-4 rounded-full whitespace-nowrap shrink-0 text-sm font-semibold transition-all duration-200 border",
                  active === sport.slug
                    ? "bg-primary/[0.12] border-primary/35 text-primary"
                    : "bg-white/[0.04] border-white/[0.07] text-muted-foreground hover:border-white/[0.16] hover:text-foreground hover:bg-white/[0.07]"
                )}
              >
                <span className="text-base leading-none">{sport.icon}</span>
                <span>{sport.label}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
