"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, MapPin, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useListFeaturedVenues } from "@workspace/api-client-react";

export default function FeaturedVenues() {
  const { data: featuredVenues, isLoading: loadingVenues } = useListFeaturedVenues();
  const venues = Array.isArray(featuredVenues) ? featuredVenues : [];

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">
            Top Venues
          </p>
          <h2
            className="text-3xl md:text-4xl font-black uppercase tracking-tighter"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Featured Venues
          </h2>
        </div>
        <Link
          href="/venues"
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest group"
        >
          View All
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loadingVenues ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden border border-white/[0.05]">
              <Skeleton className="h-52 w-full bg-white/[0.05]" />
              <div className="p-5 space-y-3 bg-[#0B1020]">
                <Skeleton className="h-5 w-3/4 bg-white/[0.05]" />
                <Skeleton className="h-4 w-1/2 bg-white/[0.05]" />
                <Skeleton className="h-4 w-1/3 bg-white/[0.05]" />
              </div>
            </div>
          ))
        ) : venues.length === 0 ? (
          <div className="col-span-full py-16 text-center rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02]">
            <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="font-bold text-lg text-muted-foreground">
              Venues coming soon to your city.
            </p>
            <Link
              href="/list-venue"
              className="text-primary hover:underline mt-2 inline-block text-sm font-semibold"
            >
              Own a turf? List it free →
            </Link>
          </div>
        ) : (
          venues.slice(0, 3).map((venue: any, i: number) => (
            <Link key={venue.id} href={`/venues/${venue.id}`}>
              <motion.article
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.09 }}
                className="glass-card rounded-2xl overflow-hidden group cursor-pointer border border-white/[0.055] hover:border-primary/[0.22] transition-all duration-300 hover:-translate-y-1"
              >
                {/* Image with overlays */}
                <div className="relative h-52 overflow-hidden bg-[#101522]">
                  <img
                    src={venue.coverImage || "/venues/venue1.png"}
                    alt={venue.name}
                    className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-500 opacity-80"
                  />
                  {/* Bottom gradient for text legibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

                  {/* Sport badges — overlaid on image */}
                  <div className="absolute bottom-3 left-3 flex gap-1.5">
                    {(Array.isArray(venue.sports) 
                        ? venue.sports 
                        : typeof venue.sports === "string" ? [venue.sports] : []
                      ).slice(0, 2).map((sport: string) => (
                      <span
                        key={sport}
                        className="text-[10px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm text-white border border-white/[0.12] rounded-full px-2 py-0.5"
                      >
                        {sport}
                      </span>
                    ))}
                  </div>

                  {/* Rating chip */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white px-2.5 py-1 rounded-full text-xs font-bold border border-white/[0.10]">
                    <Star className="w-3 h-3 text-[#F59E0B] fill-[#F59E0B]" />
                    {venue.rating?.toFixed(1) ?? "5.0"}
                  </div>
                </div>

                {/* Card content */}
                <div className="p-5">
                  <h3 className="font-bold text-lg mb-1.5 truncate">{venue.name}</h3>
                  <div className="flex items-center text-muted-foreground text-sm mb-5">
                    <MapPin className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    <span className="truncate">
                      {venue.address}, {venue.city}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
                    <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                      Starts at
                    </span>
                    <div>
                      <span
                        className="font-black text-xl text-primary"
                        style={{ fontFamily: "var(--font-space-grotesk)" }}
                      >
                        ₹{venue.pricePerHour ?? "999"}
                      </span>
                      <span className="text-sm text-muted-foreground">/hr</span>
                    </div>
                  </div>
                </div>
              </motion.article>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
