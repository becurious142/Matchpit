"use client";

import { useUser } from "@clerk/nextjs";
import { useGetMyProfile, useUpdateMyProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, User, Camera, Star, Shield, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user } = useUser();
  const { data: profile, isLoading, refetch } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();

  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName ?? "");
      setCity(profile.city ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({
        data: { fullName, city, phone },
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
          <p className="text-lg font-bold text-white">{profile?.fullName || user?.firstName}</p>
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-semibold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full capitalize">
              {(user?.publicMetadata?.role as string) || "player"}
            </span>
            {profile?.onboardingComplete && (
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
          <Label htmlFor="fullName" className="text-white/80 text-sm">Full Name</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter your full name"
            className="bg-[#0B1020] border-white/[0.07] focus-visible:ring-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city" className="text-white/80 text-sm">City</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Your city"
              className="bg-[#0B1020] border-white/[0.07] focus-visible:ring-primary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-white/80 text-sm">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              className="bg-[#0B1020] border-white/[0.07] focus-visible:ring-primary"
            />
          </div>
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

      {/* Stats Cards — real schema fields */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: "Trust Score", value: profile?.trustScore ?? 0, icon: Shield },
          { label: "Badges", value: profile?.badgeCount ?? 0, icon: Star },
          { label: "Strike Pts", value: profile?.strikePoints ?? 0, icon: Zap },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-xl p-3 border border-white/[0.05] text-center">
            <stat.icon className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-xl font-black text-white">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
