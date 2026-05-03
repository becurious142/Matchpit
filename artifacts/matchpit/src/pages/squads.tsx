import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@clerk/react";
import { useGetMyProfile } from "@workspace/api-client-react";
import { Shield, Plus, Users, Trophy, Star, Swords } from "lucide-react";

const SPORTS = [
  { value: "all", label: "All" },
  { value: "football", label: "Football ⚽" },
  { value: "cricket", label: "Cricket 🏏" },
  { value: "badminton", label: "Badminton 🏸" },
  { value: "box_cricket", label: "Box Cricket 🏏" },
];

interface Squad {
  id: string;
  name: string;
  logoUrl: string | null;
  sport: string;
  captainUserId: string;
  description: string | null;
  wins: number;
  losses: number;
  trustRating: number;
  memberCount: number;
  isJoined: boolean;
  createdAt: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export default function SquadsPage() {
  const { isSignedIn } = useUser();
  const { data: profile } = useGetMyProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [sportFilter, setSportFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSport, setNewSport] = useState("football");
  const [newDesc, setNewDesc] = useState("");

  const { data: squads, isLoading } = useQuery<Squad[]>({
    queryKey: ["squads", sportFilter],
    queryFn: () => apiFetch(`/squads${sportFilter !== "all" ? `?sport=${sportFilter}` : ""}`),
  });

  const createSquad = useMutation({
    mutationFn: (body: any) => apiFetch("/squads/create", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["squads"] });
      toast({ title: `Squad "${data.name}" created!` });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setLocation(`/squads/${data.id}`);
    },
    onError: () => toast({ title: "Failed to create squad", variant: "destructive" }),
  });

  const joinSquad = useMutation({
    mutationFn: (squadId: string) => apiFetch(`/squads/${squadId}/join`, { method: "POST" }),
    onSuccess: (_, squadId) => {
      queryClient.invalidateQueries({ queryKey: ["squads"] });
      toast({ title: "Joined squad!" });
    },
  });

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-1">
            Jaipur <span className="text-primary">Squads</span>
          </h1>
          <p className="text-muted-foreground text-sm">Find your tribe. Play together. Dominate together.</p>
        </div>
        {isSignedIn && (
          <Button
            className="font-bold uppercase italic gap-2"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="w-4 h-4" /> Create Squad
          </Button>
        )}
      </div>

      {/* Create Squad Form */}
      {showCreate && (
        <Card className="mb-6 bg-card border-primary/30">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-bold text-lg uppercase italic">New Squad</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase block mb-1">Squad Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Jaipur Panthers"
                  className="bg-muted border-border/50"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase block mb-1">Sport</label>
                <select
                  value={newSport}
                  onChange={(e) => setNewSport(e.target.value)}
                  className="w-full h-10 rounded-md bg-muted border border-border/50 px-3 text-sm"
                >
                  {SPORTS.slice(1).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase block mb-1">Description (optional)</label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What's your squad about?"
                className="bg-muted border-border/50"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button
                disabled={!newName.trim() || createSquad.isPending}
                onClick={() => createSquad.mutate({ name: newName, sport: newSport, description: newDesc })}
                className="font-bold uppercase"
              >
                {createSquad.isPending ? "Creating..." : "Create Squad"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sport Filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        {SPORTS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSportFilter(s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase whitespace-nowrap transition-colors ${
              sportFilter === s.value ? "bg-primary text-black" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Squads Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : !squads?.length ? (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="py-20 text-center">
            <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="font-bold text-lg text-muted-foreground">No squads yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Be the first to create a squad in Jaipur!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {squads.map((squad) => (
            <SquadCard key={squad.id} squad={squad} onJoin={() => joinSquad.mutate(squad.id)} isSignedIn={!!isSignedIn} />
          ))}
        </div>
      )}
    </div>
  );
}

function SquadCard({ squad, onJoin, isSignedIn }: { squad: Squad; onJoin: () => void; isSignedIn: boolean }) {
  const winRate = squad.wins + squad.losses > 0
    ? Math.round((squad.wins / (squad.wins + squad.losses)) * 100)
    : null;

  return (
    <Card className="bg-card border-border/60 hover:border-primary/50 transition-colors overflow-hidden group">
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0 font-bold text-primary border border-primary/20">
            {squad.logoUrl ? (
              <img src={squad.logoUrl} alt="" className="w-full h-full object-cover rounded-xl" />
            ) : (
              squad.name[0]
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate">{squad.name}</h3>
            <Badge variant="secondary" className="text-[10px] uppercase font-bold mt-0.5">
              {squad.sport.replace("_", " ")}
            </Badge>
          </div>
        </div>

        {squad.description && (
          <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{squad.description}</p>
        )}

        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-muted rounded-lg p-2">
            <p className="text-sm font-extrabold text-primary">{squad.memberCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold">Members</p>
          </div>
          <div className="bg-muted rounded-lg p-2">
            <p className="text-sm font-extrabold text-green-400">{squad.wins}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold">Wins</p>
          </div>
          <div className="bg-muted rounded-lg p-2">
            <p className="text-sm font-extrabold">{squad.trustRating.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold">Rating</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Link href={`/squads/${squad.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full text-xs font-bold uppercase">
              View Squad
            </Button>
          </Link>
          {isSignedIn && !squad.isJoined && (
            <Button size="sm" className="flex-1 text-xs font-bold uppercase" onClick={onJoin}>
              Join
            </Button>
          )}
          {squad.isJoined && (
            <Badge className="flex items-center gap-1 bg-primary/10 text-primary border-primary/30 text-[10px]">
              <Shield className="w-3 h-3" /> Joined
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
