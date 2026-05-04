import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useListFeaturedVenues, useListHostedMatches, useListSports } from "@workspace/api-client-react";
import { MapPin, Users, Calendar, Clock, Trophy, Star, Zap, ShieldCheck, Wallet, ChevronRight, MessageSquare, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { useUser } from "@clerk/react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { formatSportLabel, getVenueFallbackImage } from "@/lib/sport-utils";

const SPORTS_COLORS: Record<string, string> = {
  cricket: "from-green-600 to-green-400",
  football: "from-blue-600 to-blue-400",
  badminton: "from-yellow-600 to-yellow-400",
  box_cricket: "from-orange-600 to-orange-400",
  pickleball: "from-pink-600 to-pink-400",
};

const POST_TYPE_ICONS: Record<string, string> = {
  text: "💬", image: "🖼️", looking_players: "🔍",
  match_result: "🏆", challenge: "⚡", venue_review: "📍", achievement: "🎖️",
};

export default function Home() {
  const { isSignedIn } = useUser();
  const { data: featuredVenues, isLoading: loadingVenues } = useListFeaturedVenues();
  const { data: sportsData, isLoading: loadingSports } = useListSports();
  const { data: matchesData, isLoading: loadingMatches } = useListHostedMatches({ status: "open" });

  const { data: liveStats } = useQuery<{
    venues: number; matchesHosted: number; playersJoined: number; walletRewardsDistributed: number;
  }>({
    queryKey: ["community-stats"],
    queryFn: async () => {
      const res = await fetch("/api/community/stats");
      if (!res.ok) throw new Error("stats failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: communityData } = useQuery<{ posts: any[] }>({
    queryKey: ["community-feed-preview"],
    queryFn: async () => {
      const res = await fetch("/api/community/feed?limit=4");
      if (!res.ok) return { posts: [] };
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: squadsPreview } = useQuery<any[]>({
    queryKey: ["squads-preview"],
    queryFn: async () => {
      const res = await fetch("/api/squads");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const trustStats = [
    {
      value: liveStats && liveStats.playersJoined > 0 ? `${liveStats.playersJoined}+` : "500+",
      label: "Players Active",
      icon: <Users className="w-6 h-6" />,
    },
    {
      value: liveStats && liveStats.venues > 0 ? `${liveStats.venues}+` : "15+",
      label: "Premium Venues",
      icon: <Star className="w-6 h-6" />,
    },
    {
      value: liveStats && liveStats.matchesHosted > 0 ? `${liveStats.matchesHosted}+` : "50+",
      label: "Matches Hosted",
      icon: <Trophy className="w-6 h-6" />,
    },
    {
      value: liveStats && liveStats.walletRewardsDistributed > 0
        ? `₹${Math.round(liveStats.walletRewardsDistributed)}`
        : "₹50+",
      label: "Rewards Distributed",
      icon: <Wallet className="w-6 h-6" />,
    },
  ];

  return (
    <div className="flex flex-col min-h-screen w-full">
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden flex items-center justify-center min-h-[75vh]">
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
              {liveStats && liveStats.playersJoined > 10 ? "Now live in Jaipur" : "Launching Jaipur's first premium sports booking circle"}
            </Badge>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 uppercase italic text-foreground">
              Own The <span className="text-primary">Pitch</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              The premium marketplace for Gen-Z athletes. Book top-tier turfs, host social matches, and find your squad.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/venues">
                <Button size="lg" className="text-lg font-bold w-full sm:w-auto h-14 px-8 uppercase italic shadow-lg shadow-primary/20">
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

      {/* Live Jaipur Counters */}
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

      {/* Sports Filter Strip */}
      <section className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-16 z-40 py-3">
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

        {/* Wallet Promo Banner */}
        {!isSignedIn && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/30 via-primary/15 to-background border border-primary/30 p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
              <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
                <Wallet className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <p className="font-extrabold text-xl uppercase italic">Get ₹50 Free on Signup</p>
                <p className="text-muted-foreground text-sm mt-1">Sign up, play your first match, and earn instant wallet credits. No catch.</p>
              </div>
              <Link href="/sign-up">
                <Button className="font-bold uppercase italic shrink-0 shadow-md shadow-primary/20" size="lg">
                  Claim Bonus
                </Button>
              </Link>
            </div>
          </motion.section>
        )}

        {/* Featured Venues */}
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
              featuredVenues.slice(0, 3).map((venue, i) => (
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
                          <img src={getVenueFallbackImage(venue.sports, i)} alt="Venue" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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
                            {venue.sports.slice(0, 2).map((sport) => (
                              <Badge key={sport} variant="outline" className="text-[10px] uppercase font-bold border-primary/30 text-primary">
                                {formatSportLabel(sport)}
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

        {/* Top Sport Quicklinks */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold uppercase italic tracking-tight">Book by <span className="text-primary">Sport</span></h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {(sportsData ?? []).map((sport, i) => (
              <Link key={sport.slug} href={`/venues?sport=${sport.slug}`}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.06 }}
                  className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${SPORTS_COLORS[sport.slug] ?? "from-gray-600 to-gray-400"} p-5 cursor-pointer group hover:scale-[1.02] transition-transform`}
                >
                  <div className="text-3xl mb-2">{sport.icon}</div>
                  <p className="font-extrabold uppercase text-white text-sm tracking-wide">{sport.label}</p>
                  <ChevronRight className="absolute bottom-3 right-3 w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
                </motion.div>
              </Link>
            ))}
          </div>
        </section>

        {/* Live Matches Feed */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold uppercase italic tracking-tight">Live <span className="text-primary">Matches</span></h2>
            <Link href="/matches" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline uppercase tracking-widest">
              Join Squad <ChevronRight className="w-4 h-4" />
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
                const fillPct = (match.currentPlayers / match.totalPlayers) * 100;
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
                              {match.sport === "football" ? "⚽" : match.sport === "cricket" ? "🏏" : match.sport === "badminton" ? "🏸" : "🏏"}
                              {match.sport}
                            </Badge>
                            {spotsLeft <= 2 ? (
                              <Badge variant="destructive" className="animate-pulse">🔥 {spotsLeft} left</Badge>
                            ) : (
                              <Badge variant="outline" className="border-primary/50 text-primary">Open</Badge>
                            )}
                          </div>

                          <h3 className="font-bold text-lg mb-1 truncate">{match.venue?.name || "Venue"}</h3>

                          <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-2 shrink-0 text-primary" />
                              <span>{new Date(match.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
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

                          {/* Fill progress */}
                          <div className="mt-4">
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div
                                className="bg-primary h-1.5 rounded-full transition-all"
                                style={{ width: `${Math.min(fillPct, 100)}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">{match.currentPlayers}/{match.totalPlayers} joined</p>
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
                            <span className="text-[10px] text-muted-foreground font-bold uppercase block">Reserve</span>
                            <span className="font-bold text-foreground">₹{match.reserveFee}</span>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  </Link>
                );
              })
            ) : (
              <div className="col-span-full py-16 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border">
                <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="font-bold text-lg">No open matches right now.</p>
                <p className="text-sm mt-1">Be the first to organize one in Jaipur.</p>
                <Link href="/host">
                  <Button className="mt-6 font-bold uppercase italic" size="sm">Host a Match →</Button>
                </Link>
              </div>
            )}
          </div>
        </section>


        {/* Community Feed Preview */}
        {(communityData?.posts?.length ?? 0) > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold uppercase italic tracking-tight">Sports <span className="text-primary">Adda</span></h2>
                <p className="text-sm text-muted-foreground">What Jaipur players are saying</p>
              </div>
              <Link href="/community" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline uppercase tracking-widest">
                Full Feed <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {communityData?.posts.slice(0, 4).map((post: any) => (
                <Card key={post.id} className="bg-card border-border/60 hover:border-primary/40 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-9 h-9 shrink-0">
                        <AvatarImage src={post.authorAvatar ?? undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">{post.authorName[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold">{post.authorName}</span>
                          {post.sport && <Badge variant="secondary" className="text-[9px] h-4 uppercase">{formatSportLabel(post.sport)}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{post.caption}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                          <span>{POST_TYPE_ICONS[post.type]} {post.type.replace("_", " ")}</span>
                          <span>❤️ {post.likesCount}</span>
                          <span>💬 {post.commentsCount}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="text-center mt-4">
              <Link href="/community">
                <Button variant="outline" className="font-bold uppercase italic border-primary/30 text-primary hover:bg-primary/5 gap-2">
                  <MessageSquare className="w-4 h-4" /> Join the Conversation
                </Button>
              </Link>
            </div>
          </section>
        )}

        {/* Squads Preview */}
        {(squadsPreview?.length ?? 0) > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold uppercase italic tracking-tight">Jaipur <span className="text-primary">Squads</span></h2>
                <p className="text-sm text-muted-foreground">Find your team. Play together.</p>
              </div>
              <Link href="/squads" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline uppercase tracking-widest">
                All Squads <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {squadsPreview?.slice(0, 3).map((squad: any) => (
                <Link key={squad.id} href={`/squads/${squad.id}`}>
                  <Card className="bg-card border-border/60 hover:border-primary/40 transition-colors cursor-pointer group">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xl font-bold text-primary shrink-0">
                          {squad.logoUrl ? <img src={squad.logoUrl} alt="" className="w-full h-full object-cover rounded-xl" /> : squad.name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-sm">{squad.name}</p>
                          <Badge variant="secondary" className="text-[9px] uppercase font-bold mt-0.5">{formatSportLabel(squad.sport)}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {squad.memberCount} members</span>
                        <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-yellow-400" /> {squad.wins}W / {squad.losses}L</span>
                        <span className="text-primary font-bold group-hover:underline">View →</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Owner CTA Strip */}
      <section className="mt-8 bg-card/60 border-t border-border/50">
        <div className="container mx-auto px-4 py-20 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/30">For Venue Owners</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold uppercase italic tracking-tighter mb-4">
              List Your <span className="text-primary">Turf</span>. Earn More.
            </h2>
            <p className="text-muted-foreground text-lg mb-6">
              Join Jaipur's fastest-growing sports marketplace. Get bookings from verified players, automated payouts, and real-time dashboards — all free to list.
            </p>
            <div className="flex gap-4">
              <Link href="/list-venue">
                <Button size="lg" className="font-bold uppercase italic h-12 px-8">List Your Venue</Button>
              </Link>
              <Link href="/owner">
                <Button size="lg" variant="outline" className="font-bold uppercase italic h-12 px-8 border-primary/30 text-primary hover:bg-primary/5">Owner Login</Button>
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: "📈", title: "Live Dashboard", desc: "Track bookings, revenue, and payouts in real-time." },
              { icon: "💸", title: "Instant Payouts", desc: "Get paid within 24hrs of every confirmed booking." },
              { icon: "🛡️", title: "Verified Players", desc: "All players are ID-verified through Clerk auth." },
              { icon: "📱", title: "Mobile Ready", desc: "Manage your venue from anywhere, any device." },
            ].map((item) => (
              <div key={item.title} className="bg-card border border-border/50 rounded-xl p-4">
                <div className="text-2xl mb-2">{item.icon}</div>
                <p className="font-bold text-sm mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Strip */}
      <section className="bg-primary text-primary-foreground py-16">
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
