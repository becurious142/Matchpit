"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListSports } from "@workspace/api-client-react";

export default function SportsFilter() {
  const { data: sportsData, isLoading: loadingSports } = useListSports();

  return (
    <section className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-16 z-40 py-3">
      <div className="container mx-auto px-4">
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x">
          {loadingSports ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-32 rounded-full shrink-0" />
            ))
          ) : (
            sportsData?.map((sport) => (
              <Link key={sport.slug} href={`/discover?sport=${sport.slug}`}>
                <Badge variant="secondary" className="h-10 px-4 whitespace-nowrap shrink-0 snap-start text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors font-medium flex items-center gap-2">
                  <span className="text-base">{sport.icon}</span> {sport.label}
                </Badge>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
