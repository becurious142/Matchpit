"use client";

import { useUser } from "@clerk/nextjs";
import { useGetMyProfile, useUpdateMyProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, User, Camera } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user } = useUser();
  const { data: profile, isLoading, refetch } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? "");
      setBio(profile.bio ?? "");
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({
        data: { displayName, bio },
      });
      toast.success("Profile updated successfully!");
      refetch();
    } catch (err) {
      toast.error((err as Error).message || "Failed to update profile.");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#050816] px-4 py-6 md:max-w-2xl md:mx-auto w-full pb-24">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Your Profile</h1>

      {/* Avatar */}
      <div className="flex items-center gap-5 mb-8">
        <div className="relative">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="Avatar" className="w-20 h-20 rounded-full ring-4 ring-primary/20 object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <User className="w-10 h-10 text-white" />
            </div>
          )}
          <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors">
            <Camera className="w-4 h-4 text-white" />
          </button>
        </div>
        <div>
          <p className="text-lg font-bold text-white">{user?.firstName} {user?.lastName}</p>
          <p className="text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-semibold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full capitalize">
              {(user?.publicMetadata?.role as string) || "player"}
            </span>
            {(user?.publicMetadata?.onboardingComplete as boolean) && (
              <span className="text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">
                ✓ Onboarded
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <div className="glass-card p-5 rounded-2xl border border-white/[0.07] space-y-5">
        <div className="space-y-2">
          <Label htmlFor="displayName" className="text-white/80 text-sm">Display Name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your display name"
            className="bg-[#0B1020] border-white/[0.07] focus-visible:ring-primary"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio" className="text-white/80 text-sm">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell the squad who you are..."
            rows={3}
            className="bg-[#0B1020] border-white/[0.07] focus-visible:ring-primary resize-none"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={updateProfile.isPending}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-wider neon-glow"
        >
          {updateProfile.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Save Changes</>
          )}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: "Matches Played", value: profile?.totalMatchesPlayed ?? 0 },
          { label: "Win Rate", value: `${profile?.winRate ?? 0}%` },
          { label: "Squad Rank", value: `#${profile?.rank ?? "--"}` },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-xl p-3 border border-white/[0.05] text-center">
            <p className="text-xl font-black text-primary">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
