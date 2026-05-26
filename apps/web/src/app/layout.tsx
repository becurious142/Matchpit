import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Matchpit — Book Sports Venues Near You",
    template: "%s | Matchpit",
  },
  description:
    "Discover and book football turfs, cricket grounds, badminton courts and more near you. Real-time slot availability, instant booking.",
  keywords: ["sports booking", "turf booking", "cricket ground", "football turf", "badminton court", "sports venue India"],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://matchpit.in"),
  openGraph: {
    siteName: "Matchpit",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    site: "@matchpit",
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-visual",
  themeColor: "#0F172A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`dark ${inter.variable} ${outfit.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <Providers>
            <Navbar />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
            <BottomNav />
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
