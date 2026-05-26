"use client";

import { useState } from "react";
import { Search, MapPin, List, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import SportsFilter from "@/components/home/SportsFilter";
import LiveMatchesFeed from "@/components/home/LiveMatchesFeed";
import FeaturedVenues from "@/components/home/FeaturedVenues";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ExplorePage() {
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  
  return (
    <div className="flex flex-col min-h-screen bg-[#050816] pb-20">
      {/* Sticky Search Header */}
      <div className="sticky top-14 z-30 bg-[#050816]/95 backdrop-blur-md border-b border-white/[0.06] pt-4 pb-2 px-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search turfs, matches, or clubs..." 
              className="pl-9 bg-[#0B1020] border-white/[0.05] focus-visible:ring-primary h-10 rounded-xl"
            />
          </div>
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 border-white/[0.05] bg-[#0B1020]">
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Reuse the sports pills from marketing site */}
        <div className="-mx-4 px-4 pb-2">
          <SportsFilter />
        </div>
      </div>

      {/* Main Content Toggle */}
      <div className="px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Explore Jaipur</h1>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "list" | "map")} className="w-[120px]">
          <TabsList className="grid w-full grid-cols-2 h-8 bg-[#0B1020] border border-white/[0.05]">
            <TabsTrigger value="list" className="text-xs data-[state=active]:bg-white/10"><List className="w-3 h-3 mr-1"/> List</TabsTrigger>
            <TabsTrigger value="map" className="text-xs data-[state=active]:bg-white/10"><MapIcon className="w-3 h-3 mr-1"/> Map</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {viewMode === "list" ? (
        <div className="flex flex-col gap-8">
          {/* Live Matches */}
          <section>
            <div className="px-4 mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Live Matches
              </h2>
              <p className="text-sm text-muted-foreground">Jump into active games</p>
            </div>
            <LiveMatchesFeed />
          </section>

          {/* Top Venues */}
          <section className="px-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Premium Turfs</h2>
                <p className="text-sm text-muted-foreground">Highest rated venues near you</p>
              </div>
            </div>
            <div className="-mx-4 px-4">
              <FeaturedVenues />
            </div>
          </section>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#0B1020] mx-4 rounded-xl border border-white/[0.05] h-[400px]">
          <div className="text-center text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium text-sm">Interactive Map View</p>
            <p className="text-xs opacity-70">Coming in Phase C</p>
          </div>
        </div>
      )}
    </div>
  );
}
