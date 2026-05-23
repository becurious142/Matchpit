"use client";

import { motion } from "framer-motion";
import { Wallet } from "lucide-react";
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/30 via-primary/15 to-background border border-primary/30 p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
          <Wallet className="w-7 h-7 text-primary" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <p className="font-extrabold text-xl uppercase italic">Get ₹50 Free on Signup</p>
          <p className="text-muted-foreground text-sm mt-1">Sign up, play your first match, and earn instant wallet credits. No catch.</p>
        </div>
        <Link href="/sign-up">
          <Button className="font-bold uppercase italic shrink-0 shadow-md shadow-primary/20" size="lg">
            Claim Bonus
          </Button>
        </Link>
      </div>
    </motion.section>
  );
}
