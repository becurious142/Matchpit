import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
  themeColor: "#050816",
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
        className={`dark ${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full bg-background text-foreground">
          <Providers>
            {children}
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
