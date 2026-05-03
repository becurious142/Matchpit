import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useListNotifications } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Bell, CheckCheck, Trophy, Wallet, Calendar, AlertCircle, Gift, Users, ShieldCheck, RefreshCw } from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";

type NotifType = string;

const NOTIF_META: Record<string, { icon: React.ReactNode; color: string; label: string; cta?: (refId: string | null) => { label: string; href: string } }> = {
  payment_success: {
    icon: <ShieldCheck className="w-5 h-5" />,
    color: "text-green-400 bg-green-500/10",
    label: "Payment",
    cta: () => ({ label: "View Dashboard", href: "/dashboard" }),
  },
  match_joined: {
    icon: <Users className="w-5 h-5" />,
    color: "text-primary bg-primary/10",
    label: "Joined",
    cta: (refId) => ({ label: "View Match", href: refId ? `/matches/${refId}` : "/matches" }),
  },
  match_confirmed: {
    icon: <Trophy className="w-5 h-5" />,
    color: "text-yellow-400 bg-yellow-500/10",
    label: "Confirmed",
    cta: (refId) => ({ label: "View Match", href: refId ? `/matches/${refId}` : "/matches" }),
  },
  final_payment_due: {
    icon: <AlertCircle className="w-5 h-5" />,
    color: "text-orange-400 bg-orange-500/10",
    label: "Payment Due",
    cta: (refId) => ({ label: "Pay Now", href: refId ? `/matches/${refId}` : "/dashboard/matches" }),
  },
  final_payment_overdue: {
    icon: <AlertCircle className="w-5 h-5" />,
    color: "text-red-400 bg-red-500/10",
    label: "Overdue",
    cta: (refId) => ({ label: "Pay Now", href: refId ? `/matches/${refId}` : "/dashboard/matches" }),
  },
  booking_reminder: {
    icon: <Calendar className="w-5 h-5" />,
    color: "text-blue-400 bg-blue-500/10",
    label: "Reminder",
    cta: () => ({ label: "View Bookings", href: "/dashboard/bookings" }),
  },
  match_cancelled: {
    icon: <AlertCircle className="w-5 h-5" />,
    color: "text-red-400 bg-red-500/10",
    label: "Cancelled",
    cta: () => ({ label: "Find Matches", href: "/matches" }),
  },
  badge_earned: {
    icon: <Gift className="w-5 h-5" />,
    color: "text-purple-400 bg-purple-500/10",
    label: "Badge",
    cta: () => ({ label: "View Profile", href: "/profile" }),
  },
  match_almost_full: {
    icon: <Users className="w-5 h-5" />,
    color: "text-orange-400 bg-orange-500/10",
    label: "Almost Full",
    cta: (refId) => ({ label: "Share Match", href: refId ? `/matches/${refId}` : "/matches" }),
  },
  wallet_refund_credited: {
    icon: <Wallet className="w-5 h-5" />,
    color: "text-green-400 bg-green-500/10",
    label: "Refund",
    cta: () => ({ label: "View Wallet", href: "/dashboard/wallet" }),
  },
  player_dropped_unpaid: {
    icon: <AlertCircle className="w-5 h-5" />,
    color: "text-yellow-400 bg-yellow-500/10",
    label: "Player Dropped",
    cta: (refId) => ({ label: "Manage Match", href: refId ? `/matches/${refId}` : "/dashboard/matches" }),
  },
  match_reopened: {
    icon: <RefreshCw className="w-5 h-5" />,
    color: "text-blue-400 bg-blue-500/10",
    label: "Spot Reopened",
    cta: (refId) => ({ label: "View Match", href: refId ? `/matches/${refId}` : "/matches" }),
  },
};

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: notifications, isLoading } = useListNotifications();

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to mark read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listNotifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!res.ok) throw new Error("Failed to mark all read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listNotifications"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const filtered = useMemo(() => {
    if (!notifications) return [];
    if (filter === "unread") return notifications.filter((n) => !n.isRead);
    return notifications;
  }, [notifications, filter]);

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter">
            <span className="text-primary">Notifications</span>
          </h1>
          {unreadCount > 0 && (
            <p className="text-muted-foreground text-sm mt-1">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 text-xs font-bold uppercase transition-colors ${filter === "all" ? "bg-primary text-black" : "text-muted-foreground hover:text-foreground"}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-3 py-1.5 text-xs font-bold uppercase transition-colors ${filter === "unread" ? "bg-primary text-black" : "text-muted-foreground hover:text-foreground"}`}
            >
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="py-20 text-center">
            <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="font-bold text-lg text-muted-foreground uppercase tracking-wider">
              {filter === "unread" ? "All caught up!" : "No notifications yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {filter === "unread" ? "No unread notifications." : "Book a turf or join a match to get started."}
            </p>
            <Link href="/matches">
              <Button className="mt-6 font-bold uppercase italic" size="sm">Browse Matches</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((notif) => {
            const meta = NOTIF_META[notif.type as NotifType] ?? {
              icon: <Bell className="w-5 h-5" />,
              color: "text-muted-foreground bg-muted",
              label: notif.type,
            };
            const cta = meta.cta?.(notif.referenceId ?? null);

            return (
              <div
                key={notif.id}
                className={`relative flex gap-4 p-4 rounded-xl border transition-colors cursor-default ${
                  notif.isRead
                    ? "bg-card/30 border-border/30 opacity-70"
                    : "bg-card border-border/60 shadow-sm"
                }`}
                onClick={() => !notif.isRead && markRead.mutate(notif.id)}
              >
                {!notif.isRead && (
                  <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary" />
                )}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="text-[10px] px-1.5 h-4 uppercase font-bold border-border/50">
                      {meta.label}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(parseISO(notif.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="font-bold text-sm mb-0.5">{notif.title}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{notif.body}</p>
                  {cta && (
                    <Link href={cta.href}>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 mt-2 text-xs font-bold text-primary hover:text-primary/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {cta.label} →
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
