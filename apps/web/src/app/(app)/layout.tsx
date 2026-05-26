import { AppBottomNav } from "@/components/app/app-bottom-nav";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Wallet } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Player App",
};

/**
 * (app) layout — Authenticated Player App surface
 * Design: Energetic Realtime UX | Mobile-first bottom nav | Persistent header
 * Used by: /home, /explore, /matches, /dashboard, /profile
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#050816]">
      {/* Sticky App Header */}
      <header className="sticky top-0 z-40 bg-[#0B1020]/90 backdrop-blur-md border-b border-white/[0.06] h-14">
        <div className="h-full px-4 flex items-center justify-between max-w-screen-xl mx-auto">
          <Link href="/home" className="flex items-center gap-2">
            <span
              className="text-xl font-black tracking-tighter uppercase italic text-white"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              MATCH<span className="text-gradient-lime pr-1">PIT</span>
            </span>
          </Link>
          
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] transition-colors">
              <Wallet className="w-4 h-4 text-primary" />
              {/* This would ideally read from the Wallet store on the client, 
                  but for the layout wrapper we keep it generic or build a client component for it */}
              <span className="text-xs font-bold text-white">Wallet</span>
            </button>
            <UserButton 
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8 ring-2 ring-white/10 hover:ring-primary/50 transition-all",
                }
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area (with padding for bottom nav on mobile) */}
      <main className="flex-1 pb-16 md:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <AppBottomNav />
    </div>
  );
}
