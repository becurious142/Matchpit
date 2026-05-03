import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useListHostedMatches, useListSports } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Trophy, Users, MapPin, Filter } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";

export default function Matches() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  
  const [sport, setSport] = useState(searchParams.get("sport") || "");
  const [city, setCity] = useState(searchParams.get("city") || "Jaipur");

  const { data: matchesData, isLoading: loadingMatches } = useListHostedMatches({ 
    query: { enabled: true },
    sport: sport || undefined,
    city: city || undefined,
    status: 'open'
  });
  
  const { data: sportsData } = useListSports();

  const handleFilterSport = (slug: string) => {
    const newSport = sport === slug ? "" : slug;
    setSport(newSport);
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (newSport) params.set("sport", newSport);
    setLocation(`/matches?${params.toString()}`, { replace: true });
  };

  const cities = ["Jaipur", "Delhi", "Mumbai"];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-2">Join a <span className="text-primary">Match</span></h1>
          <p className="text-muted-foreground">Find open games, pay your share, and just play.</p>
        </div>
        <Link href="/host">
          <Button size="lg" className="font-bold uppercase italic tracking-wider">Host a Match</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-4 mb-8">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
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
          
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> City
            </div>
            <div className="flex flex-wrap gap-2">
              {cities.map((c) => (
                <Badge 
                  key={c}
                  variant={city === c ? "default" : "outline"}
                  className={`cursor-pointer px-3 py-1 ${city === c ? '' : 'hover:bg-primary/10 hover:text-primary hover:border-primary/50'}`}
                  onClick={() => {
                    setCity(c);
                    const params = new URLSearchParams();
                    params.set("city", c);
                    if (sport) params.set("sport", sport);
                    setLocation(`/matches?${params.toString()}`, { replace: true });
                  }}
                >
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-6">
        {loadingMatches ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))
        ) : matchesData?.matches && matchesData.matches.length > 0 ? (
          matchesData.matches.map((match, i) => {
            const spotsLeft = match.totalPlayers - match.currentPlayers;
            const progress = (match.currentPlayers / match.totalPlayers) * 100;
            
            return (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Card 
                  className="overflow-hidden group cursor-pointer hover:border-primary transition-colors bg-card/50 backdrop-blur-sm border-border/50 relative"
                  onClick={() => setLocation(`/matches/${match.id}`)}
                >
                  <div className="absolute top-0 left-0 h-1 bg-primary" style={{ width: `${progress}%` }} />
                  
                  <div className="flex flex-col md:flex-row">
                    {/* Venue Image - Left side on desktop, top on mobile */}
                    <div className="md:w-64 h-32 md:h-auto bg-muted relative shrink-0">
                      {match.venue?.coverImage ? (
                        <img src={match.venue.coverImage} alt={match.venue.name} className="w-full h-full object-cover opacity-80" />
                      ) : (
                        <img src={`/venues/venue${(i % 4) + 1}.png`} alt="Venue" className="w-full h-full object-cover opacity-80" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-background via-background/50 to-transparent" />
                      <div className="absolute bottom-4 left-4 md:hidden">
                        <Badge className="capitalize font-bold shadow-lg shadow-black/50">
                          {match.sport}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* Content */}
                    <CardContent className="flex-1 p-5 md:p-6 flex flex-col justify-between">
                      <div className="flex flex-col md:flex-row justify-between md:items-start gap-4 mb-4">
                        <div>
                          <div className="hidden md:flex gap-2 mb-2">
                            <Badge className="capitalize font-bold">{match.sport}</Badge>
                            {spotsLeft <= 2 ? (
                              <Badge variant="destructive" className="animate-pulse">🔥 {spotsLeft} spots left</Badge>
                            ) : (
                              <Badge variant="outline" className="border-primary/50 text-primary">Open</Badge>
                            )}
                          </div>
                          
                          <h3 className="font-bold text-2xl uppercase italic tracking-tight">{match.venue?.name}</h3>
                          <div className="flex items-center text-muted-foreground text-sm mt-1">
                            <MapPin className="w-4 h-4 mr-1" /> {match.venue?.address}, {match.venue?.city}
                          </div>
                        </div>

                        <div className="flex flex-row md:flex-col justify-between md:items-end bg-muted/50 md:bg-transparent p-3 md:p-0 rounded-lg md:rounded-none">
                          <div className="text-left md:text-right">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Reserve Fee</div>
                            <div className="text-2xl font-extrabold text-primary">₹{match.reserveFee}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Final est.</div>
                            <div className="text-sm font-bold">~₹{match.finalFeePerPlayer}</div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border/50">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <div className="text-[10px] uppercase font-bold text-muted-foreground">Date</div>
                            <div className="text-sm font-bold">{format(parseISO(match.date), 'MMM d, yyyy')}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <div className="text-[10px] uppercase font-bold text-muted-foreground">Time</div>
                            <div className="text-sm font-bold">{match.startTime}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Trophy className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <div className="text-[10px] uppercase font-bold text-muted-foreground">Level</div>
                            <div className="text-sm font-bold capitalize">{match.skillLevel}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <div className="text-[10px] uppercase font-bold text-muted-foreground">Players</div>
                            <div className="text-sm font-bold">{match.currentPlayers} / {match.totalPlayers}</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </motion.div>
            );
          })
        ) : (
          <div className="py-20 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed border-border">
            <Trophy className="w-12 h-12 mb-4 text-muted-foreground/50 mx-auto" />
            <h3 className="text-xl font-bold text-foreground mb-2">No open matches right now</h3>
            <p>Check back later or be the first to host one in {city}.</p>
            <Link href="/host">
              <Button className="mt-6 font-bold uppercase italic">Host a Match</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}