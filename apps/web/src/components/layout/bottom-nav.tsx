"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, Zap, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home", icon: Home, exact: true, live: false },
  { href: "/discover", label: "Discover", icon: Compass, exact: false, live: false },
  { href: "/matches", label: "Matches", icon: Zap, exact: false, live: true },
  { href: "/clubs", label: "Clubs", icon: Users, exact: false, live: false },
  { href: "/profile", label: "Profile", icon: User, exact: false, live: false },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 z-50 w-full md:hidden glass-surface border-t border-white/[0.07]">
      {/* Neon top accent line on active — subtle gradient */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

      <div
        className="flex items-center justify-around px-1 pb-safe"
        style={{ minHeight: "3.5rem" }}
      >
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href) && (link.href !== "/" || pathname === "/");

          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center justify-center gap-1 relative py-2 px-4 min-w-[3rem] flex-1"
            >
              {/* Active top indicator */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />
              )}

              <div className="relative">
                <Icon
                  className={cn(
                    "h-5 w-5 transition-colors duration-200",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                {/* Live dot for Matches tab */}
                {link.live && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-live-pulse" />
                )}
              </div>

              <span
                className={cn(
                  "text-[10px] font-semibold transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
