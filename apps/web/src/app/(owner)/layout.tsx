"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, IndianRupee, Settings, LogOut, Menu } from "lucide-react";
import { UserButton, useClerk } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const OWNER_LINKS = [
  { href: "/owner/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/owner/calendar", label: "Calendar", icon: Calendar },
  { href: "/owner/payouts", label: "Payouts", icon: IndianRupee },
  { href: "/owner/settings", label: "Settings", icon: Settings },
];

function SidebarContent() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full bg-[#03040B] border-r border-white/[0.06]">
      <div className="p-6">
        <Link href="/owner/overview" className="flex items-center gap-2">
          <span
            className="text-2xl font-black tracking-tighter uppercase italic text-white"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            MATCH<span className="text-gradient-lime pr-1">PIT</span>
          </span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground border border-white/10 rounded px-1.5 py-0.5 ml-2">Owner</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {OWNER_LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                isActive 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-white/[0.03] hover:text-white"
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 px-3 py-2">
          <UserButton 
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "w-8 h-8",
              }
            }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Owner Account</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * (owner) layout — Venue Owner SaaS surface
 * Design: Premium Operational UX | Desktop sidebar | Mobile drawer
 * Used by: /owner/overview, /owner/calendar, etc.
 */
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#050816] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 fixed inset-y-0 left-0 z-50">
        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-40 bg-[#0B1020]/90 backdrop-blur-md border-b border-white/[0.06] h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <button className="p-1.5 -ml-1.5 text-muted-foreground hover:text-white transition-colors">
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 border-r border-white/[0.06] bg-[#03040B]">
                <SidebarContent />
              </SheetContent>
            </Sheet>
            <span
              className="text-lg font-black tracking-tighter uppercase italic text-white"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              MATCH<span className="text-gradient-lime pr-1">PIT</span>
            </span>
          </div>
          <UserButton afterSignOutUrl="/" />
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
