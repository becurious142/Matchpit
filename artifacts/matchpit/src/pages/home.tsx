import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListFeaturedVenues, useListHostedMatches, useListSports } from "@workspace/api-client-react";
import { MapPin, Users, Calendar, Clock, Trophy } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const { data: featuredVenues, isLoading: loadingVenues } = useListFeaturedVenues();
  const { data: sportsData, isLoading: loadingSports } = useListSports();
  const { data: matchesData, isLoading: loadingMatches } = useListHostedMatches({ status: 'open' });

  return (
    <div className="flex flex-col min-h-screen w-full">
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden flex items-center justify-center min-h-[70vh]">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background z-10" />
          <img 
            src="/venues/venue1.png" 
            alt="Hero Background" 
            className="w-full h-full object-cover opacity-40 blur-[2px]"
          />
        </div>
        
        <div className="container relative z-20 px-4 mx-auto text-center flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge className="mb-6 px-4 py-1.5 text-sm font-medium bg-primary/20 text-primary hover:bg-primary/30 border-primary/30">
              Now live in Jaipur
            </Badge>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 uppercase italic text-foreground">
              Own The <span className="text-primary">Pitch</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              The premium marketplace for Gen-Z athletes. Book top-tier turfs, host social matches, and find your squad.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/venues">
                <Button size="lg" className="text-lg font-bold w-full sm:w-auto h-14 px-8 uppercase italic">
                  Book a Turf
                </Button>
              </Link>
              <Link href="/host">
                <Button size="lg" variant="outline" className="text-lg font-bold w-full sm:w-auto h-14 px-8 uppercase italic border-primary text-primary hover:bg-primary/10">
                  Host a Match
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Sports Filter Strip */}
      <section className="border-y border-border/50 bg-card/30 backdrop-blur-sm sticky top-16 z-40 py-3">
        <div className="container mx-auto px-4">
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x">
            {loadingSports ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-32 rounded-full shrink-0" />
              ))
            ) : (
              sportsData?.map((sport) => (
                <Link key={sport.slug} href={`/venues?sport=${sport.slug}`}>
                  <Badge variant="secondary" className="h-10 px-4 whitespace-nowrap shrink-0 snap-start text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors font-medium flex items-center gap-2">
                    <span className="text-base">{sport.icon}</span> {sport.label}
                  </Badge>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-16 space-y-24">
        {/* Featured Venues */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold uppercase italic tracking-tight">Featured <span className="text-primary">Venues</span></h2>
            <Link href="/venues" className="text-sm font-medium text-primary hover:underline uppercase tracking-widest">
              View All
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loadingVenues ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[300px] w-full rounded-xl" />
              ))
            ) : (
              featuredVenues?.slice(0,3).map((venue, i) => (
                <Link key={venue.id} href={`/venues/${venue.id}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.1 }}
                  >
                    <Card className="overflow-hidden group cursor-pointer hover:border-primary transition-colors bg-card/50 backdrop-blur-sm border-border/50">
                      <div className="relative h-48 overflow-hidden bg-muted">
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
                      <CardContent className="p-5">
                        <h3 className="font-bold text-xl mb-1 truncate">{venue.name}</h3>
                        <div className="flex items-center text-muted-foreground text-sm mb-4">
                          <MapPin className="w-4 h-4 mr-1 shrink-0" />
                          <span className="truncate">{venue.address}, {venue.city}</span>
                        </div>
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                          <div className="flex flex-wrap gap-1">
                            {venue.sports.slice(0, 2).map(sport => (
                              <Badge key={sport} variant="outline" className="text-[10px] uppercase font-bold border-primary/30 text-primary">
                                {sport}
                              </Badge>
                            ))}
                            {venue.sports.length > 2 && (
                              <Badge variant="outline" className="text-[10px] uppercase font-bold">
                                +{venue.sports.length - 2}
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Starts at</span>
                            <p className="font-bold text-lg text-primary">₹{venue.pricePerHour}<span className="text-sm font-normal text-muted-foreground">/hr</span></p>
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

        {/* Live Matches Feed */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold uppercase italic tracking-tight">Live <span className="text-primary">Matches</span></h2>
            <Link href="/matches" className="text-sm font-medium text-primary hover:underline uppercase tracking-widest">
              Join Squad
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {loadingMatches ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[220px] w-full rounded-xl" />
              ))
            ) : matchesData?.matches && matchesData.matches.length > 0 ? (
              matchesData.matches.slice(0, 4).map((match, i) => {
                const spotsLeft = match.totalPlayers - match.currentPlayers;
                
                return (
                  <Link key={match.id} href={`/matches/${match.id}`}>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: i * 0.1 }}
                      className="h-full"
                    >
                      <Card className="h-full overflow-hidden group cursor-pointer hover:border-primary transition-colors bg-card/50 backdrop-blur-sm border-border/50 flex flex-col">
                        <div className="p-4 flex-1">
                          <div className="flex justify-between items-start mb-3">
                            <Badge variant="secondary" className="capitalize flex items-center gap-1 font-bold">
                              {match.sport === 'football' ? '⚽' : match.sport === 'cricket' ? '🏏' : match.sport === 'badminton' ? '🏸' : match.sport === 'tennis' ? '🎾' : '🏀'} 
                              {match.sport}
                            </Badge>
                            {spotsLeft <= 2 ? (
                              <Badge variant="destructive" className="animate-pulse">🔥 {spotsLeft} spots left</Badge>
                            ) : (
                              <Badge variant="outline" className="border-primary/50 text-primary">Open</Badge>
                            )}
                          </div>
                          
                          <h3 className="font-bold text-lg mb-1 truncate">{match.venue?.name || "Venue"}</h3>
                          
                          <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-2 shrink-0 text-primary" />
                              <span>{new Date(match.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                            </div>
                            <div className="flex items-center">
                              <Clock className="w-4 h-4 mr-2 shrink-0 text-primary" />
                              <span>{match.startTime} - {match.endTime}</span>
                            </div>
                            <div className="flex items-center">
                              <Trophy className="w-4 h-4 mr-2 shrink-0 text-primary" />
                              <span className="capitalize">{match.skillLevel} Level</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-muted/50 p-4 border-t border-border flex items-center justify-between mt-auto">
                          <div className="flex -space-x-2">
                            {Array.from({ length: Math.min(match.currentPlayers, 3) }).map((_, j) => (
                              <div key={j} className="w-8 h-8 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-xs font-bold text-muted-foreground">
                                <Users className="w-3 h-3" />
                              </div>
                            ))}
                            {match.currentPlayers > 3 && (
                              <div className="w-8 h-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary">
                                +{match.currentPlayers - 3}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase block">Reserve Fee</span>
                            <span className="font-bold text-foreground">₹{match.reserveFee}</span>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  </Link>
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                <p>No open matches right now.</p>
                <Link href="/host" className="text-primary hover:underline mt-2 inline-block font-medium">
                  Be the first to host one
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
      
      {/* CTA Strip */}
      <section className="bg-primary text-primary-foreground py-16 mt-auto">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold uppercase italic tracking-tighter mb-4 text-black">
            Have a squad? Build a match.
          </h2>
          <p className="text-black/80 max-w-2xl mx-auto mb-8 text-lg font-medium">
            Book a turf, set the skill level, and split the cost automatically. Host for just ₹99.
          </p>
          <Link href="/host">
            <Button size="lg" variant="outline" className="bg-black text-primary hover:bg-black/90 border-transparent text-lg font-bold h-14 px-8 uppercase italic">
              Start Hosting
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}