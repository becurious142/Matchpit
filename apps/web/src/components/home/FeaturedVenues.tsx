"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListFeaturedVenues } from "@workspace/api-client-react";

export default function FeaturedVenues() {
  const { data: featuredVenues, isLoading: loadingVenues } = useListFeaturedVenues();

  return (
    <section>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold uppercase italic tracking-tight">Featured <span className="text-primary">Venues</span></h2>
        <Link href="/venues" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline uppercase tracking-widest">
          View All <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loadingVenues ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] w-full rounded-xl" />
          ))
        ) : !featuredVenues?.length ? (
          <div className="col-span-full py-16 text-center bg-muted/20 rounded-2xl border border-dashed border-border">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-bold text-lg text-muted-foreground">Venues coming soon to your city.</p>
            <Link href="/list-venue" className="text-primary hover:underline mt-2 inline-block text-sm font-medium">Own a turf? List it free →</Link>
          </div>
        ) : (
          featuredVenues.slice(0, 3).map((venue: any, i: number) => (
            <Link key={venue.id} href={`/venues/${venue.id}`}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <Card className="overflow-hidden group cursor-pointer hover:border-primary transition-colors bg-card/50 backdrop-blur-sm border-border/50">
                  <div className="relative h-48 overflow-hidden bg-muted">
                    {venue.coverImage ? (
                      <img src={venue.coverImage} alt={venue.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <img src="/venues/venue1.png" alt="Venue" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    )}
                    <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md text-white px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 border border-white/10">
                      ⭐ {venue.rating?.toFixed(1) || "5.0"}
                    </div>
                  </div>
                  <CardContent className="p-5">
                    <h3 className="font-bold text-xl mb-1 truncate">{venue.name}</h3>
                    <div className="flex items-center text-muted-foreground text-sm mb-4">
                      <MapPin className="w-4 h-4 mr-1 shrink-0" />
                      <span className="truncate">{venue.address}, {venue.city}</span>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                      <div className="flex flex-wrap gap-1">
                        {venue.sports?.slice(0, 2).map((sport: string) => (
                          <Badge key={sport} variant="outline" className="text-[10px] uppercase font-bold border-primary/30 text-primary">
                            {sport}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Starts at</span>
                        <p className="font-bold text-lg text-primary">₹{venue.pricePerHour || "999"}<span className="text-sm font-normal text-muted-foreground">/hr</span></p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
