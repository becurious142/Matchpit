import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@clerk/react";
import { useGetMyProfile } from "@workspace/api-client-react";
import { Shield, Trophy, Users, Swords, Send, Star, Crown } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export default function SquadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isSignedIn } = useUser();
  const { data: profile } = useGetMyProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");

  const { data: squad, isLoading } = useQuery<any>({
    queryKey: ["squad-detail", id],
    queryFn: () => apiFetch(`/squads/${id}`),
  });

  const joinSquad = useMutation({
    mutationFn: () => apiFetch(`/squads/${id}/join`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["squad-detail", id] });
      toast({ title: "Joined squad!" });
    },
  });

  const leaveSquad = useMutation({
    mutationFn: () => apiFetch(`/squads/${id}/leave`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["squad-detail", id] });
      toast({ title: "Left squad." });
    },
  });

  const postMessage = useMutation({
    mutationFn: (message: string) => apiFetch(`/squads/${id}/post`, { method: "POST", body: JSON.stringify({ message }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["squad-detail", id] });
      setNewMessage("");
    },
    onError: () => toast({ title: "Only squad members can post", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!squad) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <p className="text-muted-foreground font-bold text-xl">Squad not found.</p>
      </div>
    );
  }

  const isMember = squad.members?.some((m: any) => m.userId === profile?.id);
  const isCaptain = squad.captainUserId === profile?.id;
  const winRate = squad.wins + squad.losses > 0
    ? Math.round((squad.wins / (squad.wins + squad.losses)) * 100)
    : null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      {/* Header */}
      <Card className="bg-card border-border/60 mb-6 overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary/30 via-primary/15 to-background relative">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, hsl(var(--primary)) 0%, transparent 60%)"
          }} />
        </div>
        <CardContent className="p-6 -mt-8">
          <div className="flex items-end gap-4 mb-4">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border-4 border-background flex items-center justify-center text-3xl font-extrabold text-primary shrink-0">
              {squad.logoUrl ? (
                <img src={squad.logoUrl} alt={squad.name} className="w-full h-full object-cover rounded-2xl" />
              ) : (
                squad.name[0]
              )}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold uppercase italic">{squad.name}</h1>
                {isCaptain && <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]"><Crown className="w-3 h-3 mr-1" />Captain</Badge>}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px] uppercase font-bold">{squad.sport.replace("_", " ")}</Badge>
                <span className="text-xs text-muted-foreground">Jaipur</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {isSignedIn && !isMember && (
                <Button size="sm" className="font-bold uppercase" onClick={() => joinSquad.mutate()} disabled={joinSquad.isPending}>
                  {joinSquad.isPending ? "Joining..." : "Join Squad"}
                </Button>
              )}
              {isMember && !isCaptain && (
                <Button size="sm" variant="outline" className="font-bold uppercase text-muted-foreground" onClick={() => leaveSquad.mutate()}>
                  Leave
                </Button>
              )}
            </div>
          </div>

          {squad.description && (
            <p className="text-sm text-muted-foreground mb-4">{squad.description}</p>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Members", value: squad.memberCount, icon: <Users className="w-4 h-4" /> },
              { label: "Wins", value: squad.wins, icon: <Trophy className="w-4 h-4 text-yellow-400" /> },
              { label: "Losses", value: squad.losses, icon: <Swords className="w-4 h-4 text-red-400" /> },
              { label: "Rating", value: squad.trustRating.toFixed(1), icon: <Star className="w-4 h-4 text-primary" /> },
            ].map((stat) => (
              <div key={stat.label} className="bg-muted rounded-xl p-3 text-center">
                <div className="flex justify-center mb-1 text-muted-foreground">{stat.icon}</div>
                <p className="text-lg font-extrabold">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">{stat.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Squad Wall */}
        <div className="md:col-span-2">
          <h2 className="text-xl font-bold uppercase italic mb-4">Squad Wall</h2>

          {/* Post to wall */}
          {isMember && (
            <div className="flex gap-2 mb-4">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newMessage.trim() && postMessage.mutate(newMessage)}
                placeholder="Post to the squad wall..."
                className="flex-1 bg-muted border border-border/50 rounded-lg px-4 py-2 text-sm outline-none focus:border-primary/50"
              />
              <Button
                size="sm"
                disabled={!newMessage.trim() || postMessage.isPending}
                onClick={() => postMessage.mutate(newMessage)}
                className="font-bold"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}

          {!squad.posts?.length ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground text-sm">No posts yet. Be the first to say something!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {squad.posts.map((post: any) => (
                <Card key={post.id} className="bg-card border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={post.authorAvatar ?? undefined} />
                        <AvatarFallback className="text-xs bg-muted">{post.authorName[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{post.authorName}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(parseISO(post.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{post.message}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Members list */}
        <div>
          <h2 className="text-xl font-bold uppercase italic mb-4">Members ({squad.memberCount})</h2>
          <Card className="bg-card border-border/60">
            <CardContent className="p-4 space-y-3">
              {squad.members?.map((member: any) => (
                <div key={member.id} className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={member.avatar ?? undefined} />
                    <AvatarFallback className="text-xs bg-muted">{member.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.name}</p>
                    <p className="text-[10px] text-muted-foreground">Trust: {member.trustScore}</p>
                  </div>
                  {member.role === "captain" && (
                    <Crown className="w-4 h-4 text-yellow-400 shrink-0" />
                  )}
                </div>
              ))}
              {!squad.members?.length && (
                <p className="text-xs text-muted-foreground text-center py-4">No members yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Challenge CTA */}
          {isMember && (
            <Card className="mt-4 bg-primary/5 border-primary/20">
              <CardContent className="p-4 text-center">
                <Swords className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="font-bold text-sm mb-2">Challenge a Squad</p>
                <p className="text-xs text-muted-foreground mb-3">Call out another squad for a match on the pitch.</p>
                <Button size="sm" className="w-full font-bold uppercase text-xs">
                  Issue Challenge
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
