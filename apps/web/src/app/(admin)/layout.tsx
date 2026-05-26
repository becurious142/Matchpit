"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Building2, CreditCard, ShieldCheck, LogOut, Menu } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const ADMIN_LINKS = [
  { href: "/admin/overview", label: "System Overview", icon: ShieldCheck },
  { href: "/admin/users", label: "Users & Profiles", icon: Users },
  { href: "/admin/venues", label: "Venues & Approvals", icon: Building2 },
  { href: "/admin/payments", label: "Ledger & Payouts", icon: CreditCard },
];

function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full bg-[#020205] border-r border-white/[0.04]">
      <div className="p-5 border-b border-white/[0.04]">
        <Link href="/admin/overview" className="flex items-center gap-2 text-red-500">
          <ShieldCheck className="w-5 h-5" />
          <span className="font-bold tracking-tight text-sm">ADMINISTRATOR</span>
        </Link>
      </div>

      <nav className="flex-1 py-4 space-y-0.5">
        {ADMIN_LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-5 py-2.5 text-sm transition-colors",
                isActive 
                  ? "bg-white/[0.03] text-white font-medium border-r-2 border-red-500" 
                  : "text-white/50 hover:bg-white/[0.02] hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 opacity-70" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/[0.04]">
        <UserButton 
          afterSignOutUrl="/"
          showName
          appearance={{
            elements: {
              userButtonBox: "text-white/70 text-sm",
              avatarBox: "w-7 h-7",
            }
          }}
        />
      </div>
    </div>
  );
}

/**
 * (admin) layout — Admin Operations surface
 * Design: Minimal Utility UX | Extremely clean, data-focused, minimal padding
 * Used by: /admin/*
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#05050A] flex text-sm">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-60 fixed inset-y-0 left-0 z-50">
        <AdminSidebar />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-60 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-40 bg-[#020205] border-b border-white/[0.04] h-12 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <button className="p-1 -ml-1 text-white/50 hover:text-white transition-colors">
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-60 border-r border-white/[0.04] bg-[#020205]">
                <AdminSidebar />
              </SheetContent>
            </Sheet>
            <span className="font-bold tracking-tight text-red-500 text-xs">ADMIN</span>
          </div>
          <UserButton afterSignOutUrl="/" />
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
