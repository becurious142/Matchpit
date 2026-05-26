import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Matchpit — Book Sports Venues Near You",
    template: "%s | Matchpit",
  },
};

/**
 * (public) layout — Marketing & Discovery surface
 * Design: Cinematic Gen-Z | Glass navbar | Full footer
 * Used by: /, /discover, /venues, /tournaments, /clubs, /teams
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
