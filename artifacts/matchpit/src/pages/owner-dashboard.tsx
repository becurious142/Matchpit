import { useState, useEffect } from "react";
import { useGetMyProfile } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import {
  Building2, IndianRupee, Calendar, Users, TrendingUp, Clock, ChevronRight
} from "lucide-react";

interface OwnerVenue {
  id: string; name: string; city: string; address: string; sports: string[];
  pricePerHour: number; isApproved: boolean; isFeatured: boolean;
}
interface OwnerDashboard {
  hasVenues: boolean;
  venues: { id: string; name: string; city: string }[];
  summary: {
    bookingsToday: number;
    totalConfirmedBookings: number;
    pendingPayoutAmount: number;
    paidPayoutAmount: number;
    totalEarnings: number;
    upcomingMatchCount: number;
  } | null;
  upcomingMatches: {
    id: string; sport: string; date: string; startTime: string; endTime: string;
    currentPlayers: number; totalPlayers: number; status: string;
  }[];
}
interface OwnerPayout {
  id: string; referenceType: string; grossAmount: number;
  platformCommission: number; venuePayable: number; status: string;
  paidAt: string | null; createdAt: string;
}
interface OwnerBooking {
  id: string; date: string; startTime: string; endTime: string;
  sport: string; totalAmount: number; status: string;
}

async function ownerFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error((await res.json()).message ?? "Request failed");
  return res.json();
}

export default function OwnerDashboard() {
  const { toast } = useToast();
  const { data: profile, isLoading: profileLoading } = useGetMyProfile();

  const [dashboard, setDashboard] = useState<OwnerDashboard | null>(null);
  const [payouts, setPayouts] = useState<OwnerPayout[]>([]);
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    Promise.all([
      ownerFetch<OwnerDashboard>("/owner/dashboard"),
      ownerFetch<OwnerPayout[]>("/owner/payouts"),
      ownerFetch<OwnerBooking[]>("/owner/bookings"),
    ])
      .then(([dash, po, bk]) => {
        setDashboard(dash);
        setPayouts(po);
        setBookings(bk);
      })
      .catch((e) => toast({ title: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [profile]);

  if (profileLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!profile) return <Redirect to="/sign-in" />;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!dashboard?.hasVenues) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-2xl text-center">
        <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
        <h1 className="text-3xl font-extrabold uppercase italic tracking-tighter mb-3">
          Venue <span className="text-primary">Owner Panel</span>
        </h1>
        <p className="text-muted-foreground mb-8">
          Your account isn't linked to any venue yet. Contact Matchpit admin to get access to your venue dashboard.
        </p>
        <Button variant="outline" className="font-bold uppercase" onClick={() => window.location.href = "/list-venue"}>
          Register Your Venue <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  const { summary, upcomingMatches } = dashboard;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl min-h-screen">
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter">
          Venue <span className="text-primary">Owner Panel</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          {dashboard.venues.map((v) => v.name).join(", ")} · {dashboard.venues[0]?.city}
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card/50 border-border/50 text-center">
            <CardContent className="p-4">
              <Calendar className="w-5 h-5 text-primary mb-2 mx-auto" />
              <div className="text-3xl font-extrabold">{summary.bookingsToday}</div>
              <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Today's Bookings</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50 text-center">
            <CardContent className="p-4">
              <Users className="w-5 h-5 text-primary mb-2 mx-auto" />
              <div className="text-3xl font-extrabold">{summary.totalConfirmedBookings}</div>
              <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Total Bookings</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50 text-center">
            <CardContent className="p-4">
              <IndianRupee className="w-5 h-5 text-primary mb-2 mx-auto" />
              <div className="text-3xl font-extrabold">₹{Math.round(summary.pendingPayoutAmount / 1000)}k</div>
              <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Pending Payout</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50 text-center">
            <CardContent className="p-4">
              <TrendingUp className="w-5 h-5 text-primary mb-2 mx-auto" />
              <div className="text-3xl font-extrabold">₹{Math.round(summary.totalEarnings / 1000)}k</div>
              <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Total Earned</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="bookings">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="bookings" className="font-bold uppercase tracking-wider text-xs">
            <Calendar className="w-3 h-3 mr-1" /> Bookings
          </TabsTrigger>
          <TabsTrigger value="matches" className="font-bold uppercase tracking-wider text-xs">
            <Users className="w-3 h-3 mr-1" /> Upcoming Matches
          </TabsTrigger>
          <TabsTrigger value="payouts" className="font-bold uppercase tracking-wider text-xs">
            <IndianRupee className="w-3 h-3 mr-1" /> Payouts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Sport</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No confirmed bookings yet.</TableCell>
                  </TableRow>
                ) : bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-semibold">{b.date}</TableCell>
                    <TableCell className="text-muted-foreground">{b.startTime} – {b.endTime}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] uppercase font-bold">{b.sport}</Badge></TableCell>
                    <TableCell className="font-mono font-bold">₹{b.totalAmount}</TableCell>
                    <TableCell><Badge variant="default" className="text-[10px] uppercase bg-primary text-black">Confirmed</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="matches">
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Sport</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingMatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No upcoming matches at this venue.</TableCell>
                  </TableRow>
                ) : upcomingMatches.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold">{m.date}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] uppercase font-bold">{m.sport}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{m.startTime}</TableCell>
                    <TableCell className="font-mono">{m.currentPlayers}/{m.totalPlayers}</TableCell>
                    <TableCell>
                      <Badge variant={m.status === "confirmed" ? "default" : "secondary"}
                        className={`text-[10px] uppercase font-bold ${m.status === "confirmed" ? "bg-primary text-black" : ""}`}>
                        {m.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payouts">
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No payouts yet.</TableCell>
                  </TableRow>
                ) : payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold">{p.referenceType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">₹{p.grossAmount}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">₹{p.platformCommission}</TableCell>
                    <TableCell className="font-mono font-bold text-primary">₹{p.venuePayable}</TableCell>
                    <TableCell>
                      <Badge
                        variant={p.status === "paid" ? "default" : "secondary"}
                        className={`text-[10px] uppercase font-bold ${p.status === "paid" ? "bg-green-500 text-white" : p.status === "hold" ? "border-yellow-500 text-yellow-500" : ""}`}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(p.createdAt).toLocaleDateString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
