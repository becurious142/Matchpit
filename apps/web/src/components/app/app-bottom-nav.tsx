"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, Zap, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/store/notificationStore";

const NAV_LINKS = [
  { href: "/home",    label: "Home",    icon: Home },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/matches", label: "Matches", icon: Zap, live: true },
  { href: "/profile", label: "Profile", icon: User },
];

export function AppBottomNav() {
  const pathname = usePathname();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden safe-area-bottom">
      <div className="bg-[#07091A]/95 backdrop-blur-xl border-t border-white/[0.07] px-2">
        <div className="flex items-stretch h-16">
          {NAV_LINKS.map(({ href, label, icon: Icon, live }) => {
            const isActive = pathname === href || (href !== "/home" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors",
                  isActive ? "text-primary" : "text-white/40 hover:text-white/70"
                )}
              >
                {/* Active indicator strip */}
                {isActive && (
                  <span className="absolute top-0 inset-x-3 h-0.5 bg-primary rounded-b-full" />
                )}
                <div className="relative">
                  <Icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_rgba(200,241,53,0.8)]")} />
                  {live && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#07091A] animate-pulse" />
                  )}
                </div>
                <span className={cn("text-[10px] font-semibold tracking-wide", isActive ? "text-primary" : "")}>
                  {label}
                </span>
              </Link>
            );
          })}

          {/* Notifications tab */}
          <Link
            href="/dashboard/notifications"
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors",
              pathname.startsWith("/dashboard/notifications") ? "text-primary" : "text-white/40 hover:text-white/70"
            )}
          >
            {pathname.startsWith("/dashboard/notifications") && (
              <span className="absolute top-0 inset-x-3 h-0.5 bg-primary rounded-b-full" />
            )}
            <div className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white px-0.5">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold tracking-wide">Alerts</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
