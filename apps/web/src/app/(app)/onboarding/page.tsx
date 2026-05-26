"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useUpdateMyProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trophy, ArrowRight, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

const SPORTS = [
  { id: "football", label: "Football", color: "border-blue-500/50 bg-blue-500/10 text-blue-400" },
  { id: "cricket", label: "Cricket", color: "border-amber-500/50 bg-amber-500/10 text-amber-400" },
  { id: "badminton", label: "Badminton", color: "border-purple-500/50 bg-purple-500/10 text-purple-400" },
  { id: "basketball", label: "Basketball", color: "border-orange-500/50 bg-orange-500/10 text-orange-400" },
  { id: "tennis", label: "Tennis", color: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const updateProfile = useUpdateMyProfile();
  const setAuthState = useAuthStore((s) => s.setAuthState);

  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSport = (id: string) => {
    setSelectedSports((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Update Backend Profile
      await updateProfile.mutateAsync({
        data: {
          bio: "Ready to play!",
          preferredSports: selectedSports,
        },
      });

      // 2. Update Clerk Metadata so middleware knows we're done
      await user.update({
        publicMetadata: {
          ...user.publicMetadata,
          onboardingComplete: true,
          role: user.publicMetadata.role || "player",
        },
      });

      // 3. Update local Zustand state
      setAuthState({ onboardingComplete: true });

      // 4. Redirect to personalized home
      router.push("/home");
    } catch (err) {
      console.error("Onboarding failed:", err);
      setError("Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="min-h-[100dvh] bg-[#050816] flex flex-col px-6 py-12 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full z-10">
        <div className="mb-10">
          <Trophy className="w-12 h-12 text-primary mb-6" />
          <h1
            className="text-4xl font-black uppercase tracking-tighter italic text-white"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            WELCOME TO <span className="text-gradient-lime pr-1">THE PIT</span>
          </h1>
          <p className="text-muted-foreground mt-3 font-medium">
            Select the sports you play to get personalized match invites and local turf recommendations.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-12">
          {SPORTS.map((sport) => {
            const isSelected = selectedSports.includes(sport.id);
            return (
              <button
                key={sport.id}
                onClick={() => toggleSport(sport.id)}
                className={cn(
                  "px-4 py-4 rounded-xl border text-sm font-bold tracking-wide transition-all",
                  "hover:scale-[1.02] active:scale-95",
                  isSelected
                    ? cn("border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(200,241,53,0.15)]")
                    : "border-white/10 bg-white/[0.02] text-muted-foreground"
                )}
              >
                {sport.label}
              </button>
            );
          })}
        </div>

        {error && <p className="text-destructive text-sm font-semibold mb-4 text-center">{error}</p>}

        <Button
          onClick={handleComplete}
          disabled={loading || selectedSports.length === 0}
          className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-black uppercase tracking-wider text-base"
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <span className="flex items-center gap-2">
              Enter The Pit <ArrowRight className="w-5 h-5" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
