"use client";

import { motion } from "framer-motion";
import { Wallet, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/nextjs";

export default function WalletPromo() {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded || isSignedIn) {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5 }}
    >
      <div className="relative overflow-hidden rounded-2xl glass-card border border-primary/[0.14] p-7 md:p-10">
        {/* Subtle ambient glow — not distracting */}
        <div className="absolute top-0 right-0 w-56 h-56 bg-primary/[0.06] rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-8">
          {/* Wallet icon */}
          <div className="w-16 h-16 rounded-2xl bg-primary/[0.10] border border-primary/[0.18] flex items-center justify-center shrink-0">
            <Wallet className="w-8 h-8 text-primary" />
          </div>

          {/* Copy */}
          <div className="flex-1 text-center md:text-left">
            <p
              className="text-4xl md:text-5xl font-black text-primary mb-1"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              ₹50 FREE
            </p>
            <p className="font-bold text-base text-foreground">on your first match</p>
            <p className="text-muted-foreground text-sm mt-1.5">
              Sign up, play once, and get instant wallet credits. 2,400+ players claimed.
            </p>
          </div>

          {/* CTA — neon glow as this is the primary action */}
          <Link href="/sign-up" className="shrink-0">
            <Button
              size="lg"
              className="font-bold uppercase tracking-wide h-12 px-7 neon-glow"
            >
              Claim Bonus
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
