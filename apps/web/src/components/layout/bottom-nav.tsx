"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Map, CalendarDays, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Home", icon: Search },
    { href: "/discover", label: "Map", icon: Map },
    { href: "/bookings", label: "Bookings", icon: CalendarDays },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <nav className="fixed bottom-0 z-50 flex h-16 w-full items-center justify-around border-t bg-background px-4 pb-safe md:hidden">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
        
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex flex-col items-center justify-center space-y-1 w-full h-full",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
