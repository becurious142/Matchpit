import { useState } from "react";
import {
  useGetAdminStats, useListAdminUsers, useListAdminVenues,
  useListAdminOwnerLeads, useApproveVenue, useSetVenueFeatured,
  useUpdateOwnerLeadStatus, useGetMyProfile
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import { CheckCircle, XCircle, Star, Users, Building2, TrendingUp, ClipboardList } from "lucide-react";

export default function Admin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [updatingVenueId, setUpdatingVenueId] = useState<string | null>(null);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: usersData, isLoading: usersLoading } = useListAdminUsers({});
  const { data: venues, isLoading: venuesLoading } = useListAdminVenues();
  const { data: leads, isLoading: leadsLoading } = useListAdminOwnerLeads();

  const approveVenue = useApproveVenue();
  const setFeatured = useSetVenueFeatured();
  const updateLeadStatus = useUpdateOwnerLeadStatus();

  if (profileLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!profile?.isAdmin) return <Redirect to="/" />;

  const handleApprove = async (venueId: string, isApproved: boolean) => {
    setUpdatingVenueId(venueId);
    try {
      await approveVenue.mutateAsync({ venueId, data: { isApproved } });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] });
      toast({ title: isApproved ? "Venue approved" : "Venue rejected" });
    } catch {
      toast({ title: "Failed to update venue", variant: "destructive" });
    } finally {
      setUpdatingVenueId(null);
    }
  };

  const handleFeatured = async (venueId: string, isFeatured: boolean) => {
    setUpdatingVenueId(venueId + "_feat");
    try {
      await setFeatured.mutateAsync({ venueId, data: { isFeatured } });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] });
      toast({ title: isFeatured ? "Venue featured" : "Venue unfeatured" });
    } catch {
      toast({ title: "Failed to update venue", variant: "destructive" });
    } finally {
      setUpdatingVenueId(null);
    }
  };

  const handleLeadStatus = async (leadId: string, status: "new" | "contacted" | "onboarded" | "rejected") => {
    setUpdatingLeadId(leadId);
    try {
      await updateLeadStatus.mutateAsync({ leadId, data: { status } });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/owner-leads"] });
      toast({ title: "Lead status updated" });
    } catch {
      toast({ title: "Failed to update lead", variant: "destructive" });
    } finally {
      setUpdatingLeadId(null);
    }
  };

  const pendingVenues = venues?.filter(v => !v.isApproved) ?? [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black uppercase italic tracking-tighter text-primary">Admin Control</h1>
        <Badge className="bg-primary/20 text-primary border-primary/30 font-bold uppercase">Admin</Badge>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
        ) : stats ? (
          <>
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <TrendingUp className="w-5 h-5 text-primary mb-2" />
                <div className="text-3xl font-extrabold">₹{stats.totalRevenue}</div>
                <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Total Revenue</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <ClipboardList className="w-5 h-5 text-primary mb-2" />
                <div className="text-3xl font-extrabold">{stats.totalBookings}</div>
                <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Bookings</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <Users className="w-5 h-5 text-primary mb-2" />
                <div className="text-3xl font-extrabold">{stats.totalUsers}</div>
                <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Users</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <Building2 className="w-5 h-5 text-primary mb-2" />
                <div className="text-3xl font-extrabold">{stats.pendingVenueApprovals}</div>
                <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Pending Venues</div>
                {(stats.pendingVenueApprovals > 0) && (
                  <div className="mt-1 h-1 rounded-full bg-yellow-500/60" />
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <Tabs defaultValue="venues">
        <TabsList className="mb-6">
          <TabsTrigger value="venues" className="font-bold uppercase tracking-wider">
            Venues {pendingVenues.length > 0 && <Badge className="ml-2 bg-yellow-500 text-black text-xs">{pendingVenues.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="leads" className="font-bold uppercase tracking-wider">
            Owner Leads {stats?.newOwnerLeads ? <Badge className="ml-2 bg-primary text-black text-xs">{stats.newOwnerLeads}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="users" className="font-bold uppercase tracking-wider">Users</TabsTrigger>
        </TabsList>

        {/* Venues tab */}
        <TabsContent value="venues">
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Venue</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Sports</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Featured</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {venuesLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : venues?.map(v => (
                  <TableRow key={v.id} className={!v.isApproved ? "bg-yellow-500/5" : ""}>
                    <TableCell className="font-semibold">{v.name}</TableCell>
                    <TableCell className="text-muted-foreground">{v.city}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {v.sports.slice(0, 2).map(s => (
                          <Badge key={s} variant="outline" className="text-[10px] border-border/60">{s}</Badge>
                        ))}
                        {v.sports.length > 2 && <Badge variant="outline" className="text-[10px]">+{v.sports.length - 2}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={v.isApproved ? "default" : "secondary"} className="uppercase font-bold text-[10px]">
                        {v.isApproved ? "Approved" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={updatingVenueId === v.id + "_feat"}
                        onClick={() => handleFeatured(v.id, !(v as any).isFeatured)}
                        className={`h-8 w-8 p-0 ${(v as any).isFeatured ? "text-yellow-400" : "text-muted-foreground"}`}
                      >
                        <Star className="w-4 h-4" fill={(v as any).isFeatured ? "currentColor" : "none"} />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {!v.isApproved ? (
                          <Button
                            size="sm"
                            disabled={updatingVenueId === v.id}
                            onClick={() => handleApprove(v.id, true)}
                            className="h-8 text-xs font-bold uppercase"
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Approve
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={updatingVenueId === v.id}
                            onClick={() => handleApprove(v.id, false)}
                            className="h-8 text-xs font-bold uppercase"
                          >
                            <XCircle className="w-3 h-3 mr-1" /> Reject
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Owner leads tab */}
        <TabsContent value="leads">
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Venue</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadsLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : leads?.length ? (
                  leads.map(lead => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-semibold">{lead.venueName}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.ownerName}</TableCell>
                      <TableCell className="font-mono text-sm">{lead.phone}</TableCell>
                      <TableCell>{lead.city}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={lead.status}
                          disabled={updatingLeadId === lead.id}
                          onValueChange={(v) => handleLeadStatus(lead.id, v as any)}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs font-bold uppercase">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="onboarded">Onboarded</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No owner leads yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Users tab */}
        <TabsContent value="users">
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Sports</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : usersData?.users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold">{u.fullName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                    <TableCell>{u.city || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(u.favoriteSports ?? []).slice(0, 2).map(s => (
                          <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">₹{u.walletBalance}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.createdAt).toLocaleDateString()}
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
