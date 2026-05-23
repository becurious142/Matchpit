import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-muted/40 pb-20 md:pb-0">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Matchpit</h3>
            <p className="text-sm text-muted-foreground">
              Discover and book sports venues near you instantly.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Cities</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/jaipur/sports-venues">Jaipur</Link></li>
              <li><Link href="/delhi/sports-venues">Delhi NCR</Link></li>
              <li><Link href="/bangalore/sports-venues">Bangalore</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Sports</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/football-turfs">Football</Link></li>
              <li><Link href="/cricket-grounds">Cricket</Link></li>
              <li><Link href="/badminton-courts">Badminton</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Partners</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/venue-onboarding">List your venue</Link></li>
              <li><Link href="/venue-dashboard">Partner Dashboard</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t pt-8 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Matchpit. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
