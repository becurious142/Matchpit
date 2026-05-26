import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export async function Navbar() {
  const { userId } = await auth();

  return (
    <header className="sticky top-0 z-50 w-full glass-surface border-b border-white/[0.06]">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">

        {/* Logo + Desktop Nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center shrink-0">
            <span
              className="text-xl font-black tracking-tighter uppercase italic select-none"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              MATCH<span className="text-gradient-lime pr-1">PIT</span>
            </span>
          </Link>

          <nav className="hidden md:flex gap-6 text-sm font-semibold">
            {[
              { href: "/discover", label: "Discover" },
              { href: "/venues", label: "Venues" },
              { href: "/tournaments", label: "Tournaments" },
              { href: "/clubs", label: "Clubs" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Live city indicator — desktop only */}
          <div className="hidden md:flex items-center gap-2 rounded-full px-3 py-1 bg-[#EF4444]/10 border border-[#EF4444]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-live-pulse block shrink-0" />
            <span className="text-[11px] font-bold text-[#EF4444] uppercase tracking-widest whitespace-nowrap">
              Live · Jaipur
            </span>
          </div>

          {userId ? (
            <UserButton />
          ) : (
            <>
              <Link href="/sign-in">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground font-semibold"
                >
                  Log in
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button
                  size="sm"
                  className="font-bold uppercase tracking-wide neon-glow"
                >
                  Join Free
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
