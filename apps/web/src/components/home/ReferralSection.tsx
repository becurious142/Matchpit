"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Gift, ArrowRight } from "lucide-react";
import { useUser } from "@clerk/nextjs";

export default function ReferralSection() {
  const { isSignedIn, isLoaded } = useUser();

  // Only shown to visitors — squad-building CTA
  if (!isLoaded || isSignedIn) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5 }}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.07] p-8 md:p-12"
        style={{
          background:
            "linear-gradient(135deg, #0B1020 0%, #101522 50%, #0B1020 100%)",
        }}
      >
        {/* Subtle ambient — purple tint for premium feel */}
        <div className="absolute top-0 right-0 w-52 h-52 bg-[#8B5CF6]/[0.07] rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 text-center md:text-left">
            {/* Label */}
            <div className="inline-flex items-center gap-2 bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 rounded-full px-4 py-1.5 mb-5">
              <Gift className="w-3.5 h-3.5 text-[#8B5CF6]" />
              <span className="text-xs font-bold text-[#8B5CF6] uppercase tracking-wider">
                Refer & Earn
              </span>
            </div>

            <h2
              className="text-3xl md:text-4xl font-black uppercase tracking-tighter mb-3"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              Invite Your Squad.{" "}
              <span className="text-gradient-lime">Earn ₹100.</span>
            </h2>
            <p className="text-muted-foreground text-base max-w-md">
              Refer a friend who books their first match — both of you get ₹100 in wallet credits instantly.
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-center gap-2">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="font-bold uppercase tracking-wide h-12 px-8 neon-glow"
              >
                Get Referral Link
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground">Join free · No credit card</p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
