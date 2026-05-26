"use client";

import { useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import { useNotificationStore } from "@/store/notificationStore";
import { Bell, CheckCircle2, Circle, Loader2, Info, AlertTriangle, Zap, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  SYSTEM: <Info className="w-5 h-5 text-blue-400" />,
  BOOKING: <CheckCircle2 className="w-5 h-5 text-green-400" />,
  WALLET: <Zap className="w-5 h-5 text-amber-400" />,
  ALERT: <AlertTriangle className="w-5 h-5 text-red-400" />,
};

export default function NotificationsPage() {
  const { data: notifications, isLoading, refetch } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const decrementUnread = useNotificationStore((s) => s.decrementUnread);

  const handleMarkRead = async (id: string, isRead: boolean) => {
    if (isRead) return;
    try {
      await markRead.mutateAsync({ id });
      decrementUnread();
      refetch(); // Optimistic update would be better here, but refetching is fine for now
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#050816] px-4 py-6 md:max-w-2xl md:mx-auto w-full pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <Button variant="outline" size="sm" className="h-8 text-xs border-white/10" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : notifications?.length === 0 ? (
        <div className="text-center py-20 glass-card rounded-2xl border border-white/[0.05]">
          <Bell className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/60 font-medium">You're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications?.map((notif) => {
            const isRead = notif.isRead;
            return (
              <div 
                key={notif.id} 
                onClick={() => handleMarkRead(notif.id, isRead)}
                className={cn(
                  "p-4 rounded-xl border transition-all cursor-pointer flex gap-4",
                  isRead 
                    ? "bg-[#0B1020] border-transparent opacity-60" 
                    : "glass-card border-white/[0.1] hover:bg-white/[0.02]"
                )}
              >
                <div className="mt-1 shrink-0">
                  {TYPE_ICONS[notif.type] || <Bell className="w-5 h-5 text-white/50" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={cn("font-bold text-sm", isRead ? "text-white/80" : "text-white")}>
                      {notif.title}
                    </h3>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap pt-0.5">
                      {format(new Date(notif.createdAt), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <p className={cn("text-sm mt-1 leading-relaxed", isRead ? "text-muted-foreground" : "text-white/80")}>
                    {notif.body}
                  </p>
                </div>
                {!isRead && (
                  <div className="shrink-0 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
