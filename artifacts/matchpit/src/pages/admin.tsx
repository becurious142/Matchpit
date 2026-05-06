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
import { formatSportLabel } from "@/lib/sport-utils";
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
  ToggleRight, Plus, Zap, ShieldAlert, Bell, Activity, MessageSquare,
  Flag, Sprout, RefreshCw, Shield, Database
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
  const headers: any = { "Content-Type": "application/json", ...(opts?.headers ?? {}) };
  
  if (typeof window !== "undefined" && (window as any).Clerk?.session) {
    const token = await (window as any).Clerk.session.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`/api${path}`, {
    ...opts,
    headers,
  });
  if (!res.ok) throw new Error((await res.json()).message ?? "Request failed");
  return res.json();
}

export default function Admin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [updatingVenueId, setUpdatingVenueId] = useState<string | null>(null);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [activatingVenueId, setActivatingVenueId] = useState<string | null>(null);

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

  // ── Live Ops state ─────────────────────────────────────────────────────────
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [liveMatchesLoading, setLiveMatchesLoading] = useState(false);
  const [liveOpsMatchId, setLiveOpsMatchId] = useState("");
  const [liveOpsUserId, setLiveOpsUserId] = useState("");
  const [liveOpsReason, setLiveOpsReason] = useState("");
  const [liveOpsAction, setLiveOpsAction] = useState<string | null>(null);

  // ── Dispatch Logs state ────────────────────────────────────────────────────
  const [dispatchLogs, setDispatchLogs] = useState<any[]>([]);
  const [dispatchLogsLoading, setDispatchLogsLoading] = useState(false);

  // ── Funnels state ──────────────────────────────────────────────────────────
  const [funnels, setFunnels] = useState<any | null>(null);
  const [funnelsLoading, setFunnelsLoading] = useState(false);

  // ── KPI state ─────────────────────────────────────────────────────────────
  const [kpi, setKpi] = useState<any | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  // ── Moderation state ───────────────────────────────────────────────────────
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  // ── Seed state ────────────────────────────────────────────────────────────
  const [seedRunning, setSeedRunning] = useState(false);
  const [seedResults, setSeedResults] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    loadCities();
    loadFinance();
    loadCoupons();
    loadMatchFinance();
    loadReferralConfig();
    loadLiveMatches();
  }, [profile?.isAdmin]);

  const loadDispatchLogs = async () => {
    setDispatchLogsLoading(true);
    try {
      const data = await adminFetch<any[]>("/admin/dispatch-logs");
      setDispatchLogs(data);
    } finally { setDispatchLogsLoading(false); }
  };

  const loadFunnels = async () => {
    setFunnelsLoading(true);
    try {
      const data = await adminFetch<any>("/admin/funnels");
      setFunnels(data);
    } finally { setFunnelsLoading(false); }
  };

  const loadKpi = async () => {
    setKpiLoading(true);
    try {
      const data = await adminFetch<any>("/admin/kpi");
      setKpi(data);
    } finally { setKpiLoading(false); }
  };

  const loadReports = async () => {
    setReportsLoading(true);
    try {
      const data = await adminFetch<any[]>("/admin/reports");
      setReports(data);
    } finally { setReportsLoading(false); }
  };

  const handleUpdateReport = async (reportId: string, status: string) => {
    try {
      await adminFetch(`/admin/reports/${reportId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status } : r));
      toast({ title: "Report updated" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const handleSuspendUser = async (userId: string, suspended: boolean) => {
    try {
      await adminFetch(`/admin/users/${userId}/suspend`, { method: "POST", body: JSON.stringify({ suspended }) });
      toast({ title: suspended ? "User suspended" : "User unsuspended" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const handleRunSeedAll = async () => {
    setSeedRunning(true);
    setSeedResults(null);
    try {
      const data = await adminFetch<any>("/admin/seed/all", { method: "POST" });
      setSeedResults(data.results);
      toast({ title: "Demo data seeded successfully!" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSeedRunning(false); }
  };

  const loadLiveMatches = async () => {
    setLiveMatchesLoading(true);
    try {
      const data = await adminFetch<any[]>("/admin/live-matches");
      setLiveMatches(data);
    } finally { setLiveMatchesLoading(false); }
  };

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

  const handleConvertLead = async (leadId: string) => {
    setConvertingLeadId(leadId);
    try {
      const result = await adminFetch<{ success: boolean; venueId: string; venueName: string }>(
        `/admin/owner-leads/${leadId}/convert`,
        { method: "POST" }
      );
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/owner-leads"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] });
      toast({ title: `Venue "${result.venueName}" created — ID ${result.venueId.slice(0, 8)}…` });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setConvertingLeadId(null); }
  };

  const handleActivateVenue = async (venueId: string) => {
    setActivatingVenueId(venueId);
    try {
      await adminFetch(`/admin/venues/${venueId}/activate`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] });
      toast({ title: "Venue activated — slots generated for 14 days" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setActivatingVenueId(null); }
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

      <Tabs
        defaultValue="venues"
        onValueChange={(tab) => {
          // Auto-load data when a new tab is first activated
          if (tab === "dispatch" && dispatchLogs.length === 0 && !dispatchLogsLoading) loadDispatchLogs();
          if (tab === "funnels" && !funnels && !funnelsLoading) loadFunnels();
          if (tab === "kpi" && !kpi && !kpiLoading) loadKpi();
          if (tab === "moderation" && reports.length === 0 && !reportsLoading) loadReports();
        }}
      >
        <TabsList className="mb-6 flex-wrap md:flex-nowrap overflow-x-auto h-auto gap-1 w-full justify-start">
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
          <TabsTrigger value="liveops" className="font-bold uppercase tracking-wider text-xs">
            <Zap className="w-3 h-3 mr-1" /> Live Ops
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="font-bold uppercase tracking-wider text-xs" onClick={loadDispatchLogs}>
            <Bell className="w-3 h-3 mr-1" /> Dispatch
          </TabsTrigger>
          <TabsTrigger value="funnels" className="font-bold uppercase tracking-wider text-xs" onClick={loadFunnels}>
            <Activity className="w-3 h-3 mr-1" /> Funnels
          </TabsTrigger>
          <TabsTrigger value="kpi" className="font-bold uppercase tracking-wider text-xs" onClick={loadKpi}>
            <TrendingUp className="w-3 h-3 mr-1" /> KPI
          </TabsTrigger>
          <TabsTrigger value="moderation" className="font-bold uppercase tracking-wider text-xs" onClick={loadReports}>
            <Flag className="w-3 h-3 mr-1" /> Moderation
          </TabsTrigger>
          <TabsTrigger value="seed" className="font-bold uppercase tracking-wider text-xs">
            <Database className="w-3 h-3 mr-1" /> Seed
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
                          <Badge key={s} variant="outline" className="text-[10px] border-border/60">{formatSportLabel(s)}</Badge>
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
                        <Button size="sm" disabled={activatingVenueId === v.id}
                          onClick={() => handleActivateVenue(v.id)} className="h-8 text-xs font-bold uppercase bg-primary text-black hover:bg-primary/90">
                          <Zap className="w-3 h-3 mr-1" /> Activate
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadsLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
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
                        <Select value={lead.status} disabled={updatingLeadId === lead.id || lead.status === "onboarded"}
                          onValueChange={(v) => handleLeadStatus(lead.id, v)}>
                          <SelectTrigger className="h-8 w-32 text-xs font-bold uppercase">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="qualified">Qualified</SelectItem>
                            <SelectItem value="onboarded">Onboarded</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {(lead as any).venueId ? (
                          <Badge variant="outline" className="text-[10px] font-mono gap-1 cursor-default">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            Venue linked
                          </Badge>
                        ) : (lead.status === "new" || lead.status === "qualified") ? (
                          <Button size="sm" disabled={convertingLeadId === lead.id}
                            onClick={() => handleConvertLead(lead.id)}
                            className="h-8 text-xs font-bold uppercase bg-primary text-black hover:bg-primary/90">
                            <Sprout className="w-3 h-3 mr-1" />
                            {convertingLeadId === lead.id ? "Converting…" : "Convert"}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No owner leads yet.</TableCell>
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

        {/* ── Live Ops tab ────────────────────────────────────────────────────── */}
        <TabsContent value="liveops">
          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-bold uppercase italic mb-1">Live <span className="text-primary">Ops</span></h2>
              <p className="text-sm text-muted-foreground">Force match state transitions, suspend users, and trigger cron jobs.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Force Confirm */}
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <h3 className="font-bold uppercase text-sm">Force Confirm Match</h3>
                  </div>
                  <Input
                    placeholder="Match ID (UUID)"
                    value={liveOpsMatchId}
                    onChange={(e) => setLiveOpsMatchId(e.target.value)}
                    className="h-9 font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    className="w-full font-bold uppercase"
                    disabled={!liveOpsMatchId || liveOpsAction === "confirm"}
                    onClick={async () => {
                      setLiveOpsAction("confirm");
                      try {
                        await adminFetch(`/admin/matches/${liveOpsMatchId}/force-confirm`, { method: "POST" });
                        toast({ title: "Match force-confirmed" });
                        loadLiveMatches();
                      } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                      finally { setLiveOpsAction(null); }
                    }}
                  >
                    {liveOpsAction === "confirm" ? "Confirming..." : "Force Confirm"}
                  </Button>
                </CardContent>
              </Card>

              {/* Force Cancel */}
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="w-4 h-4 text-destructive" />
                    <h3 className="font-bold uppercase text-sm">Force Cancel Match</h3>
                  </div>
                  <Input
                    placeholder="Match ID (UUID)"
                    value={liveOpsMatchId}
                    onChange={(e) => setLiveOpsMatchId(e.target.value)}
                    className="h-9 font-mono text-xs"
                  />
                  <Input
                    placeholder="Reason (optional)"
                    value={liveOpsReason}
                    onChange={(e) => setLiveOpsReason(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full font-bold uppercase"
                    disabled={!liveOpsMatchId || liveOpsAction === "cancel"}
                    onClick={async () => {
                      setLiveOpsAction("cancel");
                      try {
                        await adminFetch(`/admin/matches/${liveOpsMatchId}/force-cancel`, {
                          method: "POST",
                          body: JSON.stringify({ reason: liveOpsReason || undefined }),
                        });
                        toast({ title: "Match force-cancelled" });
                        loadLiveMatches();
                      } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                      finally { setLiveOpsAction(null); }
                    }}
                  >
                    {liveOpsAction === "cancel" ? "Cancelling..." : "Force Cancel"}
                  </Button>
                </CardContent>
              </Card>

              {/* Resend Final Payment */}
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Bell className="w-4 h-4 text-yellow-500" />
                    <h3 className="font-bold uppercase text-sm">Resend Final Payment</h3>
                  </div>
                  <Input
                    placeholder="Match ID (UUID)"
                    value={liveOpsMatchId}
                    onChange={(e) => setLiveOpsMatchId(e.target.value)}
                    className="h-9 font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full font-bold uppercase border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/5"
                    disabled={!liveOpsMatchId || liveOpsAction === "resend"}
                    onClick={async () => {
                      setLiveOpsAction("resend");
                      try {
                        const r = await adminFetch<{ notified: number }>(`/admin/matches/${liveOpsMatchId}/resend-final-payment`, { method: "POST" });
                        toast({ title: `Notified ${r.notified} players` });
                      } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                      finally { setLiveOpsAction(null); }
                    }}
                  >
                    {liveOpsAction === "resend" ? "Sending..." : "Resend Reminder"}
                  </Button>
                </CardContent>
              </Card>

              {/* Suspend / Unsuspend User */}
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldAlert className="w-4 h-4 text-destructive" />
                    <h3 className="font-bold uppercase text-sm">Suspend User</h3>
                  </div>
                  <Input
                    placeholder="User ID (UUID)"
                    value={liveOpsUserId}
                    onChange={(e) => setLiveOpsUserId(e.target.value)}
                    className="h-9 font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 font-bold uppercase"
                      disabled={!liveOpsUserId || liveOpsAction === "suspend"}
                      onClick={async () => {
                        setLiveOpsAction("suspend");
                        try {
                          await adminFetch(`/admin/users/${liveOpsUserId}/suspend`, {
                            method: "POST",
                            body: JSON.stringify({ suspended: true }),
                          });
                          toast({ title: "User suspended" });
                        } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                        finally { setLiveOpsAction(null); }
                      }}
                    >
                      Suspend
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 font-bold uppercase"
                      disabled={!liveOpsUserId || liveOpsAction === "unsuspend"}
                      onClick={async () => {
                        setLiveOpsAction("unsuspend");
                        try {
                          await adminFetch(`/admin/users/${liveOpsUserId}/suspend`, {
                            method: "POST",
                            body: JSON.stringify({ suspended: false }),
                          });
                          toast({ title: "User unsuspended" });
                        } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                        finally { setLiveOpsAction(null); }
                      }}
                    >
                      Unsuspend
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Cron Triggers */}
              <Card className="bg-card/50 border-border/50 md:col-span-2">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-4 h-4 text-primary" />
                    <h3 className="font-bold uppercase text-sm">Cron Triggers</h3>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-bold uppercase"
                      disabled={liveOpsAction === "underfill"}
                      onClick={async () => {
                        setLiveOpsAction("underfill");
                        try {
                          const r = await adminFetch<any>("/admin/cron/underfill", { method: "POST" });
                          toast({ title: `Underfill cron: ${r.cancelled ?? 0} matches cancelled` });
                        } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                        finally { setLiveOpsAction(null); }
                      }}
                    >
                      {liveOpsAction === "underfill" ? "Running..." : "Run Underfill Cron"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-bold uppercase"
                      disabled={liveOpsAction === "dropunpaid"}
                      onClick={async () => {
                        setLiveOpsAction("dropunpaid");
                        try {
                          const r = await adminFetch<any>("/admin/cron/drop-unpaid", { method: "POST" });
                          toast({ title: `Drop-unpaid cron: ${r.dropped ?? 0} dropped` });
                        } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                        finally { setLiveOpsAction(null); }
                      }}
                    >
                      {liveOpsAction === "dropunpaid" ? "Running..." : "Run Drop-Unpaid Cron"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Live Matches Table */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold uppercase text-sm">All Matches ({liveMatches.length})</h3>
                <Button size="sm" variant="outline" className="h-7 text-xs font-bold uppercase" onClick={loadLiveMatches}>
                  Refresh
                </Button>
              </div>
              <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow>
                      <TableHead>Sport</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Players</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reserve Fee</TableHead>
                      <TableHead>ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveMatchesLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                    ) : liveMatches.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No matches yet.</TableCell></TableRow>
                    ) : liveMatches.slice(0, 30).map((m) => (
                      <TableRow key={m.id} className="cursor-pointer hover:bg-muted/20"
                        onClick={() => setLiveOpsMatchId(m.id)}>
                        <TableCell><Badge variant="outline" className="text-[10px] font-bold uppercase">{m.sport}</Badge></TableCell>
                        <TableCell className="text-sm">{m.date}</TableCell>
                        <TableCell className="font-mono text-sm">{m.currentPlayers}/{m.totalPlayers}</TableCell>
                        <TableCell>
                          <Badge
                            variant={m.status === "confirmed" ? "default" : m.status === "cancelled" ? "destructive" : "secondary"}
                            className={`text-[10px] font-bold uppercase ${m.status === "confirmed" ? "bg-primary text-black" : ""}`}
                          >
                            {m.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">₹{m.reserveFee}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground max-w-[120px] truncate">{m.id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Dispatch Logs tab ─────────────────────────────────────────────── */}
        <TabsContent value="dispatch">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase italic flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" /> Notification Dispatch Logs
            </h2>
            <Button size="sm" variant="outline" className="h-7 text-xs font-bold uppercase" onClick={loadDispatchLogs} disabled={dispatchLogsLoading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${dispatchLogsLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatchLogsLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : dispatchLogs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No dispatch logs found.</TableCell></TableRow>
                ) : dispatchLogs.slice(0, 200).map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-semibold text-sm">{log.userName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold">{log.channel}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{log.templateKey}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[120px] truncate">{log.destination}</TableCell>
                    <TableCell>
                      <Badge
                        variant={log.status === "sent" ? "default" : log.status === "failed" ? "destructive" : "secondary"}
                        className={`text-[10px] uppercase font-bold ${log.status === "sent" ? "bg-primary text-black" : ""}`}
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(log.createdAt).toLocaleString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Funnels tab ────────────────────────────────────────────────────── */}
        <TabsContent value="funnels">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase italic flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Conversion Funnels
            </h2>
            <Button size="sm" variant="outline" className="h-7 text-xs font-bold uppercase" onClick={loadFunnels} disabled={funnelsLoading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${funnelsLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          {funnelsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          ) : funnels ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "Signups Today", value: funnels.signupsToday, color: "text-primary" },
                  { label: "Signups This Week", value: funnels.signupsWeek, color: "text-blue-400" },
                  { label: "Total Users", value: funnels.totalUsers, color: "text-muted-foreground" },
                ].map((item) => (
                  <Card key={item.label} className="bg-card/50 border-border/50 text-center">
                    <CardContent className="p-4">
                      <div className={`text-3xl font-extrabold ${item.color}`}>{item.value}</div>
                      <div className="text-xs uppercase font-bold text-muted-foreground mt-1">{item.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Booking Conversion", started: funnels.bookingStarted, paid: funnels.bookingPaid, pct: funnels.bookingConversion },
                  { label: "Host Match Conv.", started: funnels.hostStarted, paid: funnels.hostPaid, pct: funnels.hostConversion },
                  { label: "Reserve Join Conv.", started: funnels.reserveStarted, paid: funnels.reservePaid, pct: funnels.reserveConversion },
                  { label: "Final Payment Conv.", started: funnels.finalStarted, paid: funnels.finalPaid, pct: funnels.finalConversion },
                ].map((item) => (
                  <Card key={item.label} className="bg-card/50 border-border/50">
                    <CardContent className="p-4">
                      <div className="text-xs uppercase font-bold text-muted-foreground mb-2">{item.label}</div>
                      <div className="text-2xl font-extrabold text-primary">{item.pct}%</div>
                      <div className="text-xs text-muted-foreground mt-1">{item.paid} / {item.started} completed</div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(item.pct, 100)}%` }} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "Wallet Used", value: funnels.walletUsedCount, icon: "💳" },
                  { label: "Referral Conversions", value: funnels.referralConversions, icon: "🎁" },
                  { label: "Community Posts", value: funnels.communityPostsCount, icon: "📝" },
                  { label: "Squads Created", value: funnels.squadCreatedCount, icon: "🏆" },
                ].map((item) => (
                  <Card key={item.label} className="bg-card/50 border-border/50 text-center">
                    <CardContent className="p-4">
                      <div className="text-2xl mb-1">{item.icon}</div>
                      <div className="text-2xl font-extrabold">{item.value}</div>
                      <div className="text-xs uppercase font-bold text-muted-foreground mt-1">{item.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">Click Refresh to load funnel data.</div>
          )}
        </TabsContent>

        {/* ── Founder KPI tab ────────────────────────────────────────────────── */}
        <TabsContent value="kpi">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase italic flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Founder KPI Dashboard
            </h2>
            <Button size="sm" variant="outline" className="h-7 text-xs font-bold uppercase" onClick={loadKpi} disabled={kpiLoading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${kpiLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          {kpiLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          ) : kpi ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total GMV", value: `₹${Number(kpi.gmv).toLocaleString("en-IN")}`, color: "text-primary" },
                  { label: "Wallet Liabilities", value: `₹${Number(kpi.walletLiabilities).toLocaleString("en-IN")}`, color: "text-yellow-400" },
                  { label: "Unpaid Payouts", value: `₹${Number(kpi.unpaidPayouts).toLocaleString("en-IN")}`, color: "text-red-400" },
                  { label: "Active Users (7d)", value: kpi.activeUsersWeek, color: "text-blue-400" },
                  { label: "Matches This Week", value: kpi.matchesCreatedWeek, color: "text-green-400" },
                  { label: "Reserve Conv.", value: `${kpi.reserveConversion}%`, color: "text-primary" },
                  { label: "Final Payment Conv.", value: `${kpi.finalPaymentConversion}%`, color: "text-primary" },
                  { label: "Pending Reports", value: kpi.pendingReportsCount, color: kpi.pendingReportsCount > 0 ? "text-red-400" : "text-muted-foreground" },
                ].map((item) => (
                  <Card key={item.label} className="bg-card/50 border-border/50 text-center">
                    <CardContent className="p-4">
                      <div className={`text-2xl font-extrabold ${item.color}`}>{item.value}</div>
                      <div className="text-xs uppercase font-bold text-muted-foreground mt-1">{item.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="p-5">
                    <h3 className="font-bold uppercase text-xs text-muted-foreground mb-3">Top Venues by Bookings</h3>
                    <div className="space-y-2">
                      {(kpi.topVenues ?? []).map((v: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="font-semibold truncate max-w-[160px]">{v.name}</span>
                          <Badge variant="outline" className="font-mono text-xs">{v.bookings}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="p-5">
                    <h3 className="font-bold uppercase text-xs text-muted-foreground mb-3">Top Hosts by Matches</h3>
                    <div className="space-y-2">
                      {(kpi.topHosts ?? []).map((h: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="font-semibold truncate max-w-[160px]">{h.full_name}</span>
                          <Badge variant="outline" className="font-mono text-xs">{h.matches}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="p-5">
                    <h3 className="font-bold uppercase text-xs text-muted-foreground mb-3">Top Referrers</h3>
                    <div className="space-y-2">
                      {(kpi.topReferrers ?? []).map((r: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="font-semibold truncate max-w-[120px]">{r.full_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{r.referral_code}</span>
                            <Badge variant="outline" className="font-mono text-xs">{r.referred}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">Click Refresh to load KPI data.</div>
          )}
        </TabsContent>

        {/* ── Moderation tab ─────────────────────────────────────────────────── */}
        <TabsContent value="moderation">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase italic flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Moderation
            </h2>
            <Button size="sm" variant="outline" className="h-7 text-xs font-bold uppercase" onClick={loadReports} disabled={reportsLoading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${reportsLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          <div className="space-y-8">
            {/* Reports Queue */}
            <div>
              <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                <Flag className="w-4 h-4" /> Reports Queue
              </h3>
              <div className="rounded-lg border border-border/50 overflow-hidden bg-card/30">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow>
                      <TableHead>Reporter</TableHead>
                      <TableHead>Target Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportsLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                    ) : reports.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No reports yet.</TableCell></TableRow>
                    ) : reports.map((r: any) => (
                      <TableRow key={r.id} className={r.status === "pending" ? "bg-yellow-500/5" : ""}>
                        <TableCell className="font-semibold text-sm">{r.reporterName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase">{r.targetType}</Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate text-muted-foreground">{r.reason}</TableCell>
                        <TableCell>
                          <Badge
                            variant={r.status === "pending" ? "secondary" : r.status === "actioned" ? "destructive" : "default"}
                            className="text-[10px] uppercase font-bold"
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <Select value={r.status} onValueChange={(v) => handleUpdateReport(r.id, v)}>
                            <SelectTrigger className="h-7 w-32 text-xs font-bold uppercase">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="reviewed">Reviewed</SelectItem>
                              <SelectItem value="dismissed">Dismissed</SelectItem>
                              <SelectItem value="actioned">Actioned</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Suspend User */}
            <div>
              <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Quick Suspend / Unsuspend
              </h3>
              <Card className="bg-card/50 border-border/50 max-w-md">
                <CardContent className="p-5 space-y-3">
                  <Input
                    placeholder="User ID (UUID)"
                    value={liveOpsUserId}
                    onChange={(e) => setLiveOpsUserId(e.target.value)}
                    className="h-9 font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" className="flex-1 font-bold uppercase"
                      disabled={!liveOpsUserId}
                      onClick={() => handleSuspendUser(liveOpsUserId, true)}>
                      Suspend
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 font-bold uppercase"
                      disabled={!liveOpsUserId}
                      onClick={() => handleSuspendUser(liveOpsUserId, false)}>
                      Unsuspend
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Seed tab ───────────────────────────────────────────────────────── */}
        <TabsContent value="seed">
          <div className="mb-4">
            <h2 className="text-xl font-bold uppercase italic flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" /> Demo Data Seeder
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Populate the platform with realistic Jaipur demo data for testing and demos.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            {[
              { label: "Seed Demo Profiles", desc: "40 realistic Jaipur players with sports, areas, skill levels", endpoint: "/admin/seed/demo-profiles", icon: "👤" },
              { label: "Seed Demo Community", desc: "30 community posts across sports and areas", endpoint: "/admin/seed/demo-community", icon: "📝" },
              { label: "Seed Demo Squads", desc: "10 squads with captains and members", endpoint: "/admin/seed/demo-squads", icon: "🏆" },
              { label: "Seed Demo Hosted Matches", desc: "15 matches across statuses (needs profiles + venues)", endpoint: "/admin/seed/demo-hosted-matches", icon: "⚽" },
              { label: "Seed Demo Notifications", desc: "20 notifications across demo profiles", endpoint: "/admin/seed/demo-notifications", icon: "🔔" },
              { label: "Seed Demo Challenges", desc: "5 squad challenges (needs squads)", endpoint: "/admin/seed/demo-challenges", icon: "⚔️" },
            ].map((item) => (
              <Card key={item.endpoint} className="bg-card/50 border-border/50">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-bold uppercase text-sm">{item.label}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 mb-3">{item.desc}</p>
                      <Button
                        size="sm"
                        className="font-bold uppercase w-full"
                        disabled={seedRunning}
                        onClick={async () => {
                          setSeedRunning(true);
                          try {
                            const data = await adminFetch<any>(item.endpoint, { method: "POST" });
                            toast({ title: data.message ?? "Seeded successfully" });
                          } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                          finally { setSeedRunning(false); }
                        }}
                      >
                        {seedRunning ? "Running..." : `Run ${item.label.replace("Seed ", "")}`}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 max-w-3xl">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Sprout className="w-5 h-5 text-primary" />
                  <h3 className="font-bold uppercase text-sm">Seed Full Ecosystem</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Runs all seed steps in order: profiles → community → squads → matches → notifications → challenges.
                  Requires at least one approved venue to exist.
                </p>
                <Button
                  className="font-bold uppercase w-full"
                  disabled={seedRunning}
                  onClick={handleRunSeedAll}
                >
                  {seedRunning ? "Seeding Full Ecosystem..." : "🌱 Seed Full Ecosystem"}
                </Button>
                {seedResults && (
                  <div className="mt-4 space-y-1">
                    {Object.entries(seedResults).map(([key, val]: [string, any]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span className="font-mono text-muted-foreground capitalize">{key}</span>
                        <span className="font-semibold">{val?.message ?? JSON.stringify(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <h2 className="text-xl font-bold uppercase italic flex items-center gap-2 mb-4 mt-8">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Database Maintenance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-destructive/5 border-destructive/20">
                <CardContent className="p-5">
                  <h3 className="font-bold uppercase text-sm mb-1 text-destructive">Regenerate Venue Slots</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Clears future unbooked slots and regenerates 14 days of chronological inventory for all approved venues. Use this to fix duplicated or broken slots.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="font-bold uppercase w-full"
                    disabled={seedRunning}
                    onClick={async () => {
                      setSeedRunning(true);
                      try {
                        const data = await adminFetch<any>("/admin/regenerate-slots", { method: "GET" });
                        toast({ title: data.message ?? "Slots regenerated successfully" });
                      } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                      finally { setSeedRunning(false); }
                    }}
                  >
                    Fix Inventory
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-destructive/5 border-destructive/20">
                <CardContent className="p-5">
                  <h3 className="font-bold uppercase text-sm mb-1 text-destructive">Backfill Pricing & Intervals</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Populates missing slotIntervalMins (60) and derived pricing tiers (1x, 0.8x, 1.25x, 1.4x) based on base pricePerHour. Run this after schema updates.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="font-bold uppercase w-full"
                    disabled={seedRunning}
                    onClick={async () => {
                      setSeedRunning(true);
                      try {
                        const data = await adminFetch<any>("/admin/backfill-pricing", { method: "GET" });
                        toast({ title: data.message ?? "Pricing backfilled successfully" });
                      } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
                      finally { setSeedRunning(false); }
                    }}
                  >
                    Fix Pricing Setup
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
