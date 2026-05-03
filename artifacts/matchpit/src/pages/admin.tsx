import { useState, useEffect } from "react";
import {
  useGetAdminStats, useListAdminUsers, useListAdminVenues,
  useListAdminOwnerLeads, useApproveVenue, useSetVenueFeatured,
  useUpdateOwnerLeadStatus, useGetMyProfile
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import {
  CheckCircle, XCircle, Star, Users, Building2, TrendingUp,
  ClipboardList, Globe, BarChart3, Tag, IndianRupee, ToggleLeft,
  ToggleRight, Plus
} from "lucide-react";

interface City {
  id: string; cityName: string; slug: string; isActive: boolean; launchPriority: number;
}
interface FinanceSummary {
  totalGmv: number; commissionEarned: number; pendingVenuePayouts: number;
  paidVenuePayouts: number; platformNetRevenue: number;
}
interface Payout {
  id: string; venueId: string; venueName: string; venueCity: string;
  referenceType: string; grossAmount: number; platformCommission: number;
  venuePayable: number; status: string; paidAt: string | null; createdAt: string;
}
interface Coupon {
  id: string; code: string; type: string; value: number; maxUses: number | null;
  usedCount: number; minAmount: number | null; firstBookingOnly: boolean;
  citySlug: string | null; sport: string | null; expiresAt: string | null;
  isActive: boolean; createdAt: string;
}

async function adminFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error((await res.json()).message ?? "Request failed");
  return res.json();
}

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

  // ── Cities state ──────────────────────────────────────────────────────────
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [togglingCityId, setTogglingCityId] = useState<string | null>(null);

  // ── Finance state ─────────────────────────────────────────────────────────
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);

  // ── Coupons state ─────────────────────────────────────────────────────────
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [newCoupon, setNewCoupon] = useState({ code: "", type: "flat", value: "", maxUses: "" });
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  // ── Match Finance state ────────────────────────────────────────────────────
  const [matchFinanceData, setMatchFinanceData] = useState<any[]>([]);
  const [matchFinanceLoading, setMatchFinanceLoading] = useState(false);

  // ── Referral Config state ──────────────────────────────────────────────────
  const [referralConfig, setReferralConfig] = useState<any>(null);
  const [referralConfigLoading, setReferralConfigLoading] = useState(false);
  const [editableConfig, setEditableConfig] = useState<Record<string, string>>({});
  const [savingReferralConfig, setSavingReferralConfig] = useState(false);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    loadCities();
    loadFinance();
    loadCoupons();
    loadMatchFinance();
    loadReferralConfig();
  }, [profile?.isAdmin]);

  const loadCities = async () => {
    setCitiesLoading(true);
    try {
      const data = await adminFetch<City[]>("/admin/cities");
      setCities(data);
    } finally { setCitiesLoading(false); }
  };

  const loadFinance = async () => {
    setFinanceLoading(true);
    try {
      const [fin, po] = await Promise.all([
        adminFetch<FinanceSummary>("/admin/finance"),
        adminFetch<Payout[]>("/admin/payouts"),
      ]);
      setFinance(fin);
      setPayouts(po);
    } finally { setFinanceLoading(false); }
  };

  const loadCoupons = async () => {
    setCouponsLoading(true);
    try {
      const data = await adminFetch<Coupon[]>("/admin/coupons");
      setCoupons(data);
    } finally { setCouponsLoading(false); }
  };

  const loadMatchFinance = async () => {
    setMatchFinanceLoading(true);
    try {
      const data = await adminFetch<any[]>("/admin/match-finance");
      setMatchFinanceData(data);
    } finally { setMatchFinanceLoading(false); }
  };

  const loadReferralConfig = async () => {
    setReferralConfigLoading(true);
    try {
      const data = await adminFetch<any>("/admin/referral-config");
      setReferralConfig(data);
      setEditableConfig({
        signupBonusAmount: String(data.signupBonusAmount ?? 50),
        referrerRewardAmount: String(data.referrerRewardAmount ?? 100),
        refereeRewardAmount: String(data.refereeRewardAmount ?? 50),
        firstBookingCashback: String(data.firstBookingCashback ?? 30),
        firstMatchCashback: String(data.firstMatchCashback ?? 30),
      });
    } finally { setReferralConfigLoading(false); }
  };

  const handleSaveReferralConfig = async () => {
    setSavingReferralConfig(true);
    try {
      const updated = await adminFetch<any>("/admin/referral-config", {
        method: "PATCH",
        body: JSON.stringify({
          signupBonusAmount: parseFloat(editableConfig.signupBonusAmount),
          referrerRewardAmount: parseFloat(editableConfig.referrerRewardAmount),
          refereeRewardAmount: parseFloat(editableConfig.refereeRewardAmount),
          firstBookingCashback: parseFloat(editableConfig.firstBookingCashback),
          firstMatchCashback: parseFloat(editableConfig.firstMatchCashback),
        }),
      });
      setReferralConfig(updated);
      toast({ title: "Referral config saved" });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally { setSavingReferralConfig(false); }
  };

  if (profileLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!profile?.isAdmin) return <Redirect to="/" />;

  const handleApprove = async (venueId: string, isApproved: boolean) => {
    setUpdatingVenueId(venueId);
    try {
      await approveVenue.mutateAsync({ venueId, data: { isApproved } });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] });
      toast({ title: isApproved ? "Venue approved" : "Venue rejected" });
    } catch { toast({ title: "Failed to update venue", variant: "destructive" }); }
    finally { setUpdatingVenueId(null); }
  };

  const handleFeatured = async (venueId: string, isFeatured: boolean) => {
    setUpdatingVenueId(venueId + "_feat");
    try {
      await setFeatured.mutateAsync({ venueId, data: { isFeatured } });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] });
      toast({ title: isFeatured ? "Venue featured" : "Venue unfeatured" });
    } catch { toast({ title: "Failed to update venue", variant: "destructive" }); }
    finally { setUpdatingVenueId(null); }
  };

  const handleLeadStatus = async (leadId: string, status: string) => {
    setUpdatingLeadId(leadId);
    try {
      await updateLeadStatus.mutateAsync({ leadId, data: { status: status as any } });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/owner-leads"] });
      toast({ title: "Lead status updated" });
    } catch { toast({ title: "Failed to update lead", variant: "destructive" }); }
    finally { setUpdatingLeadId(null); }
  };

  const handleToggleCity = async (city: City) => {
    setTogglingCityId(city.id);
    try {
      const updated = await adminFetch<City>(`/admin/cities/${city.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !city.isActive }),
      });
      setCities((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast({ title: `${updated.cityName} is now ${updated.isActive ? "active" : "inactive"}` });
    } catch { toast({ title: "Failed to update city", variant: "destructive" }); }
    finally { setTogglingCityId(null); }
  };

  const handleMarkPayoutPaid = async (payoutId: string) => {
    try {
      await adminFetch(`/admin/payouts/${payoutId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "paid" }),
      });
      setPayouts((prev) => prev.map((p) => p.id === payoutId ? { ...p, status: "paid" } : p));
      toast({ title: "Payout marked as paid" });
    } catch { toast({ title: "Failed to update payout", variant: "destructive" }); }
  };

  const handleCreateCoupon = async () => {
    if (!newCoupon.code || !newCoupon.value) {
      toast({ title: "Code and value are required", variant: "destructive" });
      return;
    }
    setCreatingCoupon(true);
    try {
      const coupon = await adminFetch<Coupon>("/admin/coupons", {
        method: "POST",
        body: JSON.stringify({
          code: newCoupon.code,
          type: newCoupon.type,
          value: parseFloat(newCoupon.value),
          maxUses: newCoupon.maxUses ? parseInt(newCoupon.maxUses) : null,
        }),
      });
      setCoupons((prev) => [coupon, ...prev]);
      setNewCoupon({ code: "", type: "flat", value: "", maxUses: "" });
      toast({ title: `Coupon ${coupon.code} created` });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setCreatingCoupon(false); }
  };

  const handleToggleCoupon = async (couponId: string, isActive: boolean) => {
    try {
      await adminFetch(`/admin/coupons/${couponId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      setCoupons((prev) => prev.map((c) => c.id === couponId ? { ...c, isActive } : c));
      toast({ title: isActive ? "Coupon activated" : "Coupon deactivated" });
    } catch { toast({ title: "Failed to update coupon", variant: "destructive" }); }
  };

  const pendingVenues = venues?.filter((v) => !v.isApproved) ?? [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl min-h-screen">
      <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-8">
        Admin <span className="text-primary">Control Room</span>
      </h1>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : stats ? (
          <>
            <Card className="bg-card/50 border-border/50 text-center">
              <CardContent className="p-4">
                <Users className="w-5 h-5 text-primary mb-2 mx-auto" />
                <div className="text-3xl font-extrabold">{stats.totalUsers}</div>
                <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Total Users</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 text-center">
              <CardContent className="p-4">
                <Building2 className="w-5 h-5 text-primary mb-2 mx-auto" />
                <div className="text-3xl font-extrabold">{stats.totalVenues}</div>
                <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Venues</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 text-center">
              <CardContent className="p-4">
                <TrendingUp className="w-5 h-5 text-primary mb-2 mx-auto" />
                <div className="text-3xl font-extrabold">₹{Math.round(stats.totalRevenue / 1000)}k</div>
                <div className="text-xs uppercase font-bold text-muted-foreground mt-1">GMV</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 text-center">
              <CardContent className="p-4">
                <ClipboardList className="w-5 h-5 text-primary mb-2 mx-auto" />
                <div className="text-3xl font-extrabold">{stats.pendingVenueApprovals}</div>
                <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Pending Venues</div>
                {stats.pendingVenueApprovals > 0 && <div className="mt-1 h-1 rounded-full bg-yellow-500/60" />}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <Tabs defaultValue="venues">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="venues" className="font-bold uppercase tracking-wider text-xs">
            Venues {pendingVenues.length > 0 && <Badge className="ml-1 bg-yellow-500 text-black text-[10px]">{pendingVenues.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="leads" className="font-bold uppercase tracking-wider text-xs">
            Owner CRM {stats?.newOwnerLeads ? <Badge className="ml-1 bg-primary text-black text-[10px]">{stats.newOwnerLeads}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="users" className="font-bold uppercase tracking-wider text-xs">Users</TabsTrigger>
          <TabsTrigger value="cities" className="font-bold uppercase tracking-wider text-xs">
            <Globe className="w-3 h-3 mr-1" /> Cities
          </TabsTrigger>
          <TabsTrigger value="finance" className="font-bold uppercase tracking-wider text-xs">
            <IndianRupee className="w-3 h-3 mr-1" /> Finance
          </TabsTrigger>
          <TabsTrigger value="coupons" className="font-bold uppercase tracking-wider text-xs">
            <Tag className="w-3 h-3 mr-1" /> Coupons
          </TabsTrigger>
          <TabsTrigger value="matches" className="font-bold uppercase tracking-wider text-xs">
            <BarChart3 className="w-3 h-3 mr-1" /> Match Finance
          </TabsTrigger>
          <TabsTrigger value="referral" className="font-bold uppercase tracking-wider text-xs">
            <TrendingUp className="w-3 h-3 mr-1" /> Referral
          </TabsTrigger>
        </TabsList>

        {/* ── Venues tab ────────────────────────────────────────────────────── */}
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
                ) : venues?.map((v) => (
                  <TableRow key={v.id} className={!v.isApproved ? "bg-yellow-500/5" : ""}>
                    <TableCell className="font-semibold">{v.name}</TableCell>
                    <TableCell className="text-muted-foreground">{v.city}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {v.sports.slice(0, 2).map((s) => (
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
                      <Button variant="ghost" size="sm" disabled={updatingVenueId === v.id + "_feat"}
                        onClick={() => handleFeatured(v.id, !(v as any).isFeatured)}
                        className={`h-8 w-8 p-0 ${(v as any).isFeatured ? "text-yellow-400" : "text-muted-foreground"}`}>
                        <Star className="w-4 h-4" fill={(v as any).isFeatured ? "currentColor" : "none"} />
                      </Button>
                    </TableCell>
                    <TableCell>
                      {!v.isApproved ? (
                        <Button size="sm" disabled={updatingVenueId === v.id}
                          onClick={() => handleApprove(v.id, true)} className="h-8 text-xs font-bold uppercase">
                          <CheckCircle className="w-3 h-3 mr-1" /> Approve
                        </Button>
                      ) : (
                        <Button size="sm" variant="destructive" disabled={updatingVenueId === v.id}
                          onClick={() => handleApprove(v.id, false)} className="h-8 text-xs font-bold uppercase">
                          <XCircle className="w-3 h-3 mr-1" /> Reject
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Owner CRM tab ──────────────────────────────────────────────────── */}
        <TabsContent value="leads">
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Venue</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Sports</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadsLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : leads?.length ? (
                  leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-semibold">{lead.venueName}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.ownerName}</TableCell>
                      <TableCell className="font-mono text-sm">{lead.phone}</TableCell>
                      <TableCell>{lead.city}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {lead.sports.slice(0, 2).map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(lead.createdAt).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Select value={lead.status} disabled={updatingLeadId === lead.id}
                          onValueChange={(v) => handleLeadStatus(lead.id, v)}>
                          <SelectTrigger className="h-8 w-36 text-xs font-bold uppercase">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="demo">Demo</SelectItem>
                            <SelectItem value="onboarded">Onboarded</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No owner leads yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Users tab ──────────────────────────────────────────────────────── */}
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
                ) : usersData?.users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold">{u.fullName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                    <TableCell>{u.city || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(u.favoriteSports ?? []).slice(0, 2).map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">₹{u.walletBalance}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.createdAt).toLocaleDateString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Cities tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="cities">
          <div className="mb-4">
            <h2 className="text-xl font-bold uppercase italic">City Launch Controls</h2>
            <p className="text-sm text-muted-foreground mt-1">Only venues in active cities appear in the city filter. Jaipur launches first.</p>
          </div>
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {citiesLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : cities.map((city) => (
                  <TableRow key={city.id}>
                    <TableCell className="font-bold">{city.cityName}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{city.slug}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">#{city.launchPriority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={city.isActive ? "default" : "secondary"}
                        className={`uppercase font-bold text-[10px] ${city.isActive ? "bg-primary text-black" : ""}`}>
                        {city.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={togglingCityId === city.id}
                        onClick={() => handleToggleCity(city)}
                        className={`h-8 text-xs font-bold uppercase gap-1 ${city.isActive ? "border-destructive text-destructive hover:bg-destructive/10" : "border-primary text-primary hover:bg-primary/10"}`}>
                        {city.isActive
                          ? <><ToggleLeft className="w-3 h-3" /> Disable</>
                          : <><ToggleRight className="w-3 h-3" /> Enable</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Finance tab ────────────────────────────────────────────────────── */}
        <TabsContent value="finance">
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {financeLoading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
              ) : finance ? (
                [
                  { label: "Total GMV", value: `₹${finance.totalGmv.toLocaleString("en-IN")}`, color: "text-primary" },
                  { label: "Commission", value: `₹${finance.commissionEarned.toLocaleString("en-IN")}`, color: "text-green-400" },
                  { label: "Net Revenue", value: `₹${finance.platformNetRevenue.toLocaleString("en-IN")}`, color: "text-blue-400" },
                  { label: "Pending Payouts", value: `₹${finance.pendingVenuePayouts.toLocaleString("en-IN")}`, color: "text-yellow-400" },
                  { label: "Paid Out", value: `₹${finance.paidVenuePayouts.toLocaleString("en-IN")}`, color: "text-muted-foreground" },
                ].map((item) => (
                  <Card key={item.label} className="bg-card/50 border-border/50 text-center">
                    <CardContent className="p-4">
                      <BarChart3 className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                      <div className={`text-2xl font-extrabold ${item.color}`}>{item.value}</div>
                      <div className="text-xs uppercase font-bold text-muted-foreground mt-1">{item.label}</div>
                    </CardContent>
                  </Card>
                ))
              ) : null}
            </div>

            <div>
              <h3 className="text-lg font-bold uppercase italic mb-4">Venue Payout Ledger</h3>
              <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow>
                      <TableHead>Venue</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Gross</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Payable</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financeLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                    ) : payouts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No payout records yet.</TableCell>
                      </TableRow>
                    ) : payouts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-semibold">{p.venueName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase">{p.referenceType}</Badge>
                        </TableCell>
                        <TableCell className="font-mono">₹{p.grossAmount.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">₹{p.platformCommission.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="font-mono font-bold text-primary">₹{p.venuePayable.toLocaleString("en-IN")}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "paid" ? "default" : p.status === "hold" ? "destructive" : "secondary"}
                            className="uppercase text-[10px] font-bold">
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {p.status === "pending" && (
                            <Button size="sm" className="h-7 text-xs font-bold uppercase"
                              onClick={() => handleMarkPayoutPaid(p.id)}>
                              Mark Paid
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Coupons tab ────────────────────────────────────────────────────── */}
        <TabsContent value="coupons">
          <div className="space-y-6">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold uppercase italic mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" /> Create Coupon
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Code</label>
                    <Input placeholder="LAUNCH50" value={newCoupon.code}
                      onChange={(e) => setNewCoupon((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                      className="font-mono font-bold" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Type</label>
                    <Select value={newCoupon.type} onValueChange={(v) => setNewCoupon((p) => ({ ...p, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Flat (₹)</SelectItem>
                        <SelectItem value="percent">Percent (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Value ({newCoupon.type === "flat" ? "₹" : "%"})
                    </label>
                    <Input type="number" placeholder="50" value={newCoupon.value}
                      onChange={(e) => setNewCoupon((p) => ({ ...p, value: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Max Uses</label>
                    <Input type="number" placeholder="Unlimited" value={newCoupon.maxUses}
                      onChange={(e) => setNewCoupon((p) => ({ ...p, maxUses: e.target.value }))} />
                  </div>
                </div>
                <Button className="mt-4 font-bold uppercase" onClick={handleCreateCoupon} disabled={creatingCoupon}>
                  <Plus className="w-4 h-4 mr-2" />
                  {creatingCoupon ? "Creating..." : "Create Coupon"}
                </Button>
              </CardContent>
            </Card>

            <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Used / Max</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {couponsLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ) : coupons.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No coupons yet. Create one above.</TableCell>
                    </TableRow>
                  ) : coupons.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-bold text-primary">{c.code}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">{c.type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono font-bold">
                        {c.type === "flat" ? `₹${c.value}` : `${c.value}%`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.usedCount} / {c.maxUses ?? "∞"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{c.citySlug ?? "All"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-IN") : "Never"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.isActive ? "default" : "secondary"}
                          className={`uppercase text-[10px] font-bold ${c.isActive ? "bg-primary text-black" : ""}`}>
                          {c.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline"
                          onClick={() => handleToggleCoupon(c.id, !c.isActive)}
                          className="h-7 text-xs font-bold uppercase">
                          {c.isActive ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
        {/* ── Match Finance tab ──────────────────────────────────────────────── */}
        <TabsContent value="matches">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase italic">Match Finance Inspector</h2>
            <button
              className="text-xs font-bold uppercase text-primary hover:underline"
              onClick={loadMatchFinance}
            >
              Refresh
            </button>
          </div>
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Sport</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead>Deposit Rev.</TableHead>
                  <TableHead>Final Rev.</TableHead>
                  <TableHead>Total Rev.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchFinanceLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : matchFinanceData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No hosted matches yet.</TableCell>
                  </TableRow>
                ) : matchFinanceData.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold max-w-[140px] truncate">{m.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">{m.sport}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.status === "completed" ? "default" : m.status.startsWith("cancelled") ? "destructive" : "secondary"}
                        className="text-[10px] uppercase font-bold"
                      >
                        {m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{m.hostName}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {m.depositPaidCount}/{m.totalPlayers}
                    </TableCell>
                    <TableCell className="font-mono">₹{m.depositRevenue.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="font-mono">₹{m.finalRevenue.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="font-mono font-bold text-primary">₹{m.totalRevenue.toLocaleString("en-IN")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {matchFinanceData.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-4">
              {[
                { label: "Total Deposit Revenue", value: matchFinanceData.reduce((acc, m) => acc + m.depositRevenue, 0) },
                { label: "Total Final Revenue", value: matchFinanceData.reduce((acc, m) => acc + m.finalRevenue, 0) },
                { label: "Total Match GMV", value: matchFinanceData.reduce((acc, m) => acc + m.totalRevenue, 0) },
              ].map((item) => (
                <Card key={item.label} className="bg-card/50 border-border/50 text-center">
                  <CardContent className="p-4">
                    <div className="text-2xl font-extrabold text-primary">₹{item.value.toLocaleString("en-IN")}</div>
                    <div className="text-xs uppercase font-bold text-muted-foreground mt-1">{item.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Referral Config tab ─────────────────────────────────────────────── */}
        <TabsContent value="referral">
          <div className="max-w-xl space-y-6">
            <h2 className="text-xl font-bold uppercase italic">Referral & Reward Config</h2>
            {referralConfigLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-6 space-y-5">
                  {[
                    { key: "signupBonusAmount", label: "Signup Bonus (₹)" },
                    { key: "referrerRewardAmount", label: "Referrer Reward (₹)" },
                    { key: "refereeRewardAmount", label: "Referee Welcome Credit (₹)" },
                    { key: "firstBookingCashback", label: "First Booking Cashback (₹)" },
                    { key: "firstMatchCashback", label: "First Match Cashback (₹)" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">{label}</label>
                      <Input
                        type="number"
                        value={editableConfig[key] ?? ""}
                        onChange={(e) => setEditableConfig((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="h-10 font-mono"
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                      Last updated: {referralConfig?.updatedAt ? new Date(referralConfig.updatedAt).toLocaleString("en-IN") : "—"}
                    </p>
                    <Button
                      onClick={handleSaveReferralConfig}
                      disabled={savingReferralConfig}
                      className="font-bold uppercase"
                    >
                      {savingReferralConfig ? "Saving..." : "Save Config"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
