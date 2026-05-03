import { useParams, Link, useLocation } from "wouter";
import { useState } from "react";
import { useGetVenue, useGetVenueSlots, useListHostedMatches } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Star, Clock, Phone, Info, Calendar as CalendarIcon, Users } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";

export default function VenueDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const { data: venue, isLoading: loadingVenue } = useGetVenue(id!, { query: { enabled: !!id } });
  
  const fromDate = format(new Date(), 'yyyy-MM-dd');
  const toDate = format(addDays(new Date(), 14), 'yyyy-MM-dd');
  
  const { data: slotsData, isLoading: loadingSlots } = useGetVenueSlots(id!, { from: fromDate, to: toDate }, { query: { enabled: !!id } });
  
  const { data: matchesData } = useListHostedMatches({ 
    // @ts-ignore - backend might not support venueId directly in list but we can try or filter client side
    venueId: id,
    status: 'open'
  }, { query: { enabled: !!id } });

  const selectedDaySlots = slotsData?.find(d => d.date === selectedDate)?.slots || [];

  if (loadingVenue) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-[40vh] w-full rounded-2xl mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
          <Skeleton className="h-[500px] w-full" />
        </div>
      </div>
    );
  }

  if (!venue) return <div className="text-center py-20 text-2xl font-bold uppercase italic">Venue Not Found</div>;

  return (
    <div className="min-h-screen pb-20">
      {/* Hero Image */}
      <div className="relative h-[40vh] md:h-[50vh] w-full bg-muted">
        {venue.coverImage ? (
          <img src={venue.coverImage} alt={venue.name} className="w-full h-full object-cover" />
        ) : (
          <img src={`/venues/venue1.png`} alt={venue.name} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        
        <div className="absolute bottom-0 left-0 w-full">
          <div className="container mx-auto px-4 pb-8">
            <div className="flex flex-wrap gap-2 mb-4">
              {venue.sports.map(s => (
                <Badge key={s} variant="secondary" className="bg-primary text-primary-foreground font-bold uppercase">
                  {s}
                </Badge>
              ))}
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter uppercase italic">{venue.name}</h1>
            <div className="flex items-center gap-4 mt-4 text-muted-foreground flex-wrap">
              <div className="flex items-center gap-1 font-medium text-foreground">
                <Star className="w-5 h-5 fill-primary text-primary" />
                <span>{venue.rating.toFixed(1)}</span>
                <span className="text-muted-foreground">({venue.totalReviews} reviews)</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{venue.address}, {venue.city}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-12">
            
            {/* About */}
            <section>
              <h2 className="text-2xl font-bold uppercase italic mb-4">About <span className="text-primary">Venue</span></h2>
              <p className="text-muted-foreground leading-relaxed">
                {venue.description || "A premium sports facility offering top-tier amenities for athletes. Book your slot or host a social match to experience the best sporting environment in the city."}
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                <div className="bg-card/50 border border-border/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <Clock className="w-6 h-6 text-primary mb-2" />
                  <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Timing</span>
                  <span className="font-bold">{venue.openTime} - {venue.closeTime}</span>
                </div>
                {venue.contactPhone && (
                  <div className="bg-card/50 border border-border/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                    <Phone className="w-6 h-6 text-primary mb-2" />
                    <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Contact</span>
                    <span className="font-bold">{venue.contactPhone}</span>
                  </div>
                )}
                <div className="bg-card/50 border border-border/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <Info className="w-6 h-6 text-primary mb-2" />
                  <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Price/Hr</span>
                  <span className="font-bold">₹{venue.pricePerHour}</span>
                </div>
                <div className="bg-card/50 border border-border/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <Users className="w-6 h-6 text-primary mb-2" />
                  <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Matches</span>
                  <span className="font-bold">{venue.upcomingMatches} Upcoming</span>
                </div>
              </div>
            </section>

            {/* Amenities */}
            {venue.amenities && venue.amenities.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold uppercase italic mb-4">Amenities</h2>
                <div className="flex flex-wrap gap-2">
                  {venue.amenities.map(amenity => (
                    <Badge key={amenity} variant="outline" className="px-4 py-2 border-border text-sm font-medium">
                      {amenity}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming Matches */}
            {matchesData?.matches && matchesData.matches.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold uppercase italic">Open <span className="text-primary">Matches</span> Here</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {matchesData.matches.slice(0, 4).map(match => (
                    <Card key={match.id} className="bg-card/50 backdrop-blur border-border/50 hover:border-primary transition-colors cursor-pointer" onClick={() => setLocation(`/matches/${match.id}`)}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <Badge className="capitalize">{match.sport}</Badge>
                          <span className="text-xs font-bold text-muted-foreground">{match.currentPlayers}/{match.totalPlayers} Players</span>
                        </div>
                        <div className="font-bold mb-2">{format(parseISO(match.date), 'MMM d, yyyy')} • {match.startTime}</div>
                        <div className="flex justify-between items-center mt-4">
                          <span className="text-sm text-muted-foreground capitalize">{match.skillLevel} Level</span>
                          <Button size="sm" variant="secondary" className="font-bold">Join for ₹{match.reserveFee}</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Booking Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24 bg-card/80 backdrop-blur-md border-primary/20 shadow-xl">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold uppercase italic mb-6">Book a <span className="text-primary">Slot</span></h3>
                
                <Tabs defaultValue="book">
                  <TabsList className="w-full mb-6 grid grid-cols-2">
                    <TabsTrigger value="book" className="font-bold uppercase">Book Turf</TabsTrigger>
                    <TabsTrigger value="host" className="font-bold uppercase" onClick={() => setLocation(`/host?venue=${venue.id}`)}>Host Match</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="book" className="space-y-6">
                    {/* Date Selector */}
                    <div>
                      <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4" /> Select Date
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {loadingSlots ? (
                          Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="w-16 h-20 rounded-xl shrink-0" />)
                        ) : slotsData?.map((day) => {
                          const date = parseISO(day.date);
                          const isSelected = selectedDate === day.date;
                          return (
                            <button
                              key={day.date}
                              onClick={() => setSelectedDate(day.date)}
                              className={`shrink-0 flex flex-col items-center justify-center w-16 h-20 rounded-xl border transition-all ${
                                isSelected 
                                  ? 'bg-primary text-primary-foreground border-primary scale-105 shadow-lg shadow-primary/20' 
                                  : 'bg-background border-border hover:border-primary/50'
                              }`}
                            >
                              <span className="text-xs font-bold uppercase opacity-80">{format(date, 'EEE')}</span>
                              <span className="text-xl font-extrabold">{format(date, 'dd')}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Time Slots */}
                    <div>
                      <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Select Time
                      </div>
                      <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-2">
                        {loadingSlots ? (
                          Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
                        ) : selectedDaySlots.length > 0 ? (
                          selectedDaySlots.map(slot => (
                            <button
                              key={slot.id}
                              disabled={slot.status !== 'available'}
                              onClick={() => setLocation(`/book/${venue.id}/${slot.id}`)}
                              className={`h-12 rounded-md font-bold text-sm border transition-all flex flex-col items-center justify-center
                                ${slot.status === 'available' 
                                  ? 'bg-background border-border hover:border-primary hover:text-primary' 
                                  : 'bg-muted border-transparent text-muted-foreground opacity-50 cursor-not-allowed'
                                }
                              `}
                            >
                              <span>{slot.startTime}</span>
                              {slot.priceOverride && slot.priceOverride !== venue.pricePerHour && (
                                <span className="text-[9px] text-primary">₹{slot.priceOverride}</span>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">
                            No slots available for this date.
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}