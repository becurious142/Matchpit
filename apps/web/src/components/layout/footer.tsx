import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-[#050816] border-t border-white/[0.06] pb-20 md:pb-0">
      <div className="container mx-auto px-4 pt-16 pb-10">

        {/* Top section */}
        <div className="flex flex-col md:flex-row md:items-start gap-12 mb-12">

          {/* Brand block */}
          <div className="md:w-64 shrink-0">
            <span
              className="text-2xl font-black tracking-tighter uppercase italic"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              MATCH<span className="text-gradient-lime pr-1">PIT</span>
            </span>
            <p className="text-muted-foreground text-sm mt-3 leading-relaxed max-w-xs">
              Jaipur's premium sports booking ecosystem. Book turfs, find squads, compete together.
            </p>
            {/* City live indicator */}
            <div className="flex items-center gap-2 mt-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-live-pulse block" />
              <span className="text-xs text-muted-foreground font-semibold tracking-wide">
                Active in Jaipur
              </span>
            </div>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 flex-1">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
                Cities
              </h3>
              <ul className="space-y-3">
                {[
                  { href: "/jaipur/sports-venues", label: "Jaipur" },
                  { href: "/delhi/sports-venues", label: "Delhi NCR" },
                  { href: "/bangalore/sports-venues", label: "Bangalore" },
                ].map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-foreground/60 hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
                Sports
              </h3>
              <ul className="space-y-3">
                {[
                  { href: "/football-turfs", label: "Football" },
                  { href: "/cricket-grounds", label: "Cricket" },
                  { href: "/badminton-courts", label: "Badminton" },
                ].map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-foreground/60 hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
                Partners
              </h3>
              <ul className="space-y-3">
                {[
                  { href: "/venue-onboarding", label: "List your venue" },
                  { href: "/venue-dashboard", label: "Partner Dashboard" },
                  { href: "/referrals", label: "Refer & Earn" },
                ].map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-foreground/60 hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.06] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Matchpit. All rights reserved.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            <span>Made for athletes. Built for the pit.</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
