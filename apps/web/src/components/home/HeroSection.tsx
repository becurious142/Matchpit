"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface HeroSectionProps {
  stats?: {
    playersJoined: number;
    venues: number;
    matchesHosted: number;
    walletRewardsDistributed: number;
  };
}

import { usePostHog } from "posthog-js/react";

export default function HeroSection({ stats }: HeroSectionProps) {
  const posthog = usePostHog();

  return (
    <section className="relative pt-24 pb-32 overflow-hidden flex items-center justify-center min-h-[75vh]">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background z-10" />
        <div className="absolute inset-0 bg-black/50 z-[5]" />
        <Image
          src="/venues/venue1.png"
          alt="Hero Background"
          fill
          className="object-cover opacity-40 blur-[2px]"
          priority
        />
      </div>

      <div className="container relative z-20 px-4 mx-auto text-center flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Badge className="mb-6 px-4 py-1.5 text-sm font-medium bg-primary/20 text-primary hover:bg-primary/30 border-primary/30">
            {stats && stats.playersJoined > 10 ? "Now live in Jaipur" : "Launching Jaipur's first premium sports booking circle"}
          </Badge>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 uppercase italic text-white drop-shadow-md">
            Own The <span className="text-primary">Pitch</span>
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10 drop-shadow-sm">
            The premium marketplace for Gen-Z athletes. Book top-tier turfs, host social matches, and find your squad.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/discover" onClick={() => posthog?.capture('hero_cta_book_turf')}>
              <Button size="lg" className="text-lg font-bold w-full sm:w-auto h-14 px-8 uppercase italic shadow-lg shadow-primary/20">
                Book a Turf
              </Button>
            </Link>
            <Link href="/tournaments" onClick={() => posthog?.capture('hero_cta_host_match')}>
              <Button size="lg" variant="outline" className="text-lg font-bold w-full sm:w-auto h-14 px-8 uppercase italic border-primary text-primary hover:bg-primary/10">
                Host a Match
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
