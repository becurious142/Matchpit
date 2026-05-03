import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useListVenues, useListSports } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Filter } from "lucide-react";
import { motion } from "framer-motion";

export default function Venues() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  
  const [city, setCity] = useState(searchParams.get("city") || "Jaipur");
  const [sport, setSport] = useState(searchParams.get("sport") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [searchInput, setSearchInput] = useState(search);

  const { data: venuesData, isLoading: loadingVenues } = useListVenues({ 
    query: { enabled: true }, 
    city: city || undefined, 
    sport: sport || undefined, 
    search: search || undefined 
  });
  
  const { data: sportsData } = useListSports();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    
    // Update URL params
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (sport) params.set("sport", sport);
    if (searchInput) params.set("search", searchInput);
    
    setLocation(`/venues?${params.toString()}`, { replace: true });
  };

  const handleFilterSport = (slug: string) => {
    const newSport = sport === slug ? "" : slug;
    setSport(newSport);
    
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (newSport) params.set("sport", newSport);
    if (search) params.set("search", search);
    
    setLocation(`/venues?${params.toString()}`, { replace: true });
  };

  const handleFilterCity = (newCity: string) => {
    setCity(newCity);
    
    const params = new URLSearchParams();
    if (newCity) params.set("city", newCity);
    if (sport) params.set("sport", sport);
    if (search) params.set("search", search);
    
    setLocation(`/venues?${params.toString()}`, { replace: true });
  };

  const cities = ["Jaipur", "Delhi", "Mumbai", "Bengaluru", "Hyderabad"];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl min-h-screen">
      <div className="mb-8 space-y-6">
        <div>
          <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-2">Book a <span className="text-primary">Turf</span></h1>
          <p className="text-muted-foreground">Find the best sports venues in your city.</p>
        </div>

        {/* Search and Filters */}
        <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-4 md:p-6 space-y-6">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search venues by name or location..." 
              className="pl-10 h-12 bg-background border-border/50 text-base focus-visible:ring-primary"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> City
              </div>
              <div className="flex flex-wrap gap-2">
                {cities.map((c) => (
                  <Badge 
                    key={c}
                    variant={city === c ? "default" : "outline"}
                    className={`cursor-pointer px-3 py-1 ${city === c ? '' : 'hover:bg-primary/10 hover:text-primary hover:border-primary/50'}`}
                    onClick={() => handleFilterCity(c)}
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Sport
              </div>
              <div className="flex flex-wrap gap-2">
                {sportsData?.map((s) => (
                  <Badge 
                    key={s.slug}
                    variant={sport === s.slug ? "default" : "outline"}
                    className={`cursor-pointer px-3 py-1 font-medium ${sport === s.slug ? '' : 'hover:bg-primary/10 hover:text-primary hover:border-primary/50'}`}
                    onClick={() => handleFilterSport(s.slug)}
                  >
                    <span className="mr-1">{s.icon}</span> {s.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {loadingVenues ? "Searching..." : `${venuesData?.total || 0} Venues Found`}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loadingVenues ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[300px] w-full rounded-xl" />
            ))
          ) : venuesData?.venues && venuesData.venues.length > 0 ? (
            venuesData.venues.map((venue, i) => (
              <Link key={venue.id} href={`/venues/${venue.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.3) }}
                >
                  <Card className="overflow-hidden group cursor-pointer hover:border-primary transition-colors bg-card/50 backdrop-blur-sm border-border/50 h-full flex flex-col">
                    <div className="relative h-48 overflow-hidden bg-muted shrink-0">
                      {venue.coverImage ? (
                        <img 
                          src={venue.coverImage} 
                          alt={venue.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <img src={`/venues/venue${(i % 4) + 1}.png`} alt="Venue" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      )}
                      <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md text-white px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 border border-white/10">
                        ⭐ {venue.rating.toFixed(1)}
                      </div>
                    </div>
                    <CardContent className="p-5 flex flex-col flex-1">
                      <h3 className="font-bold text-xl mb-1 truncate">{venue.name}</h3>
                      <div className="flex items-center text-muted-foreground text-sm mb-4">
                        <MapPin className="w-4 h-4 mr-1 shrink-0" />
                        <span className="truncate">{venue.address}, {venue.city}</span>
                      </div>
                      
                      <div className="mt-auto pt-4 border-t border-border/50 flex flex-col gap-3">
                        <div className="flex flex-wrap gap-1">
                          {venue.sports.slice(0, 3).map(s => (
                            <Badge key={s} variant="outline" className="text-[10px] uppercase font-bold border-primary/30 text-primary">
                              {s}
                            </Badge>
                          ))}
                          {venue.sports.length > 3 && (
                            <Badge variant="outline" className="text-[10px] uppercase font-bold">
                              +{venue.sports.length - 3}
                            </Badge>
                          )}
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Starts at</div>
                          <div className="font-bold text-lg text-primary">₹{venue.pricePerHour}<span className="text-sm font-normal text-muted-foreground">/hr</span></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </Link>
            ))
          ) : (
            <div className="col-span-full py-20 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed border-border flex flex-col items-center justify-center">
              <MapPin className="w-12 h-12 mb-4 text-muted-foreground/50" />
              <h3 className="text-xl font-bold text-foreground mb-2">No venues found</h3>
              <p>We couldn't find any venues matching your filters.</p>
              <p className="mt-1">Try adjusting your search criteria or selecting a different city.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}