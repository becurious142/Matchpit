import { useListMyHostedMatches, useListJoinedMatches } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, Trophy, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Link, useLocation } from "wouter";

export default function DashboardMatches() {
  const [, setLocation] = useLocation();
  const { data: hostedMatches, isLoading: loadingHosted } = useListMyHostedMatches();
  const { data: joinedMatches, isLoading: loadingJoined } = useListJoinedMatches();

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl min-h-screen">
      <h1 className="text-3xl font-extrabold uppercase italic mb-8">My <span className="text-primary">Matches</span></h1>

      <Tabs defaultValue="joined">
        <TabsList className="mb-8">
          <TabsTrigger value="joined" className="font-bold uppercase tracking-wider">Joined Matches</TabsTrigger>
          <TabsTrigger value="hosted" className="font-bold uppercase tracking-wider">Hosted Matches</TabsTrigger>
        </TabsList>

        <TabsContent value="joined" className="space-y-4">
          {loadingJoined ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
          ) : joinedMatches?.length ? (
            joinedMatches.map(participant => {
              const match = participant.match;
              if (!match) return null;
              return (
                <Card key={participant.id} className="bg-card/50 border-border/50 cursor-pointer hover:border-primary transition-colors" onClick={() => setLocation(`/matches/${match.id}`)}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-2">
                        <Badge variant="outline" className="border-primary text-primary font-bold uppercase">{match.sport}</Badge>
                        <Badge variant={participant.status === 'final_paid' ? 'default' : 'secondary'} className="uppercase font-bold">
                          {participant.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <span className="font-bold">{match.venue?.name}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-muted-foreground">
                      <div>
                        <div className="flex items-center gap-1 mb-1"><Calendar className="w-4 h-4"/> Date</div>
                        <div className="font-bold text-foreground">{format(parseISO(match.date), 'MMM d, yyyy')}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1"><Clock className="w-4 h-4"/> Time</div>
                        <div className="font-bold text-foreground">{match.startTime}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1"><Users className="w-4 h-4"/> Players</div>
                        <div className="font-bold text-foreground">{match.currentPlayers}/{match.totalPlayers}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1"><Trophy className="w-4 h-4"/> Level</div>
                        <div className="font-bold text-foreground capitalize">{match.skillLevel}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-12 text-muted-foreground bg-card/30 rounded-xl border border-dashed">
              You haven't joined any matches yet.
            </div>
          )}
        </TabsContent>

        <TabsContent value="hosted" className="space-y-4">
          {loadingHosted ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
          ) : hostedMatches?.length ? (
            hostedMatches.map(match => (
              <Card key={match.id} className="bg-card/50 border-border/50 cursor-pointer hover:border-primary transition-colors" onClick={() => setLocation(`/matches/${match.id}`)}>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-2">
                      <Badge variant="outline" className="border-primary text-primary font-bold uppercase">{match.sport}</Badge>
                      <Badge variant={match.status === 'open' ? 'secondary' : 'default'} className="uppercase font-bold">
                        {match.status}
                      </Badge>
                    </div>
                    <span className="font-bold">{match.venue?.name}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-muted-foreground">
                    <div>
                      <div className="flex items-center gap-1 mb-1"><Calendar className="w-4 h-4"/> Date</div>
                      <div className="font-bold text-foreground">{format(parseISO(match.date), 'MMM d, yyyy')}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1"><Clock className="w-4 h-4"/> Time</div>
                      <div className="font-bold text-foreground">{match.startTime}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1"><Users className="w-4 h-4"/> Players</div>
                      <div className="font-bold text-foreground">{match.currentPlayers}/{match.totalPlayers}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1"><Trophy className="w-4 h-4"/> Level</div>
                      <div className="font-bold text-foreground capitalize">{match.skillLevel}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-12 text-muted-foreground bg-card/30 rounded-xl border border-dashed">
              You haven't hosted any matches yet.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}