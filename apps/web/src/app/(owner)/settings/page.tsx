"use client";

import { useGetMyProfile, useUpdateMyProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Building2, User, Phone, MapPin } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";

export default function OwnerSettingsPage() {
  const { user } = useUser();
  const { data: profile, isLoading, refetch } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName ?? "");
      setPhone(profile.phone ?? "");
      setCity(profile.city ?? "");
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({
        data: { fullName, phone, city },
      });
      toast.success("Settings updated successfully!");
      refetch();
    } catch (err) {
      toast.error((err as Error).message || "Failed to update settings.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Owner Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage your personal profile and notification preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left column navigation (mocked visually for now) */}
        <div className="space-y-1 hidden md:block">
          <Button variant="ghost" className="w-full justify-start font-bold bg-white/[0.05]">
            <User className="w-4 h-4 mr-2" /> Personal Profile
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-white">
            <Building2 className="w-4 h-4 mr-2" /> Venue Details
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-white">
            <Phone className="w-4 h-4 mr-2" /> Contact & Support
          </Button>
        </div>

        {/* Right column content */}
        <div className="md:col-span-2 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-white/[0.05] space-y-6">
            <h2 className="text-lg font-bold border-b border-white/[0.05] pb-4">Personal Information</h2>
            
            <div className="flex items-center gap-4">
              <img 
                src={user?.imageUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=owner"} 
                alt="Avatar" 
                className="w-16 h-16 rounded-full border border-white/20"
              />
              <div>
                <p className="text-sm font-medium text-white">{user?.primaryEmailAddress?.emailAddress}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Managed by Clerk Auth</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="fullName" className="text-white/80">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-[#0B1020] border-white/[0.07] focus-visible:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone" className="text-white/80">Contact Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="bg-[#0B1020] border-white/[0.07] focus-visible:ring-primary pl-9"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="city" className="text-white/80">Operating City</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="bg-[#0B1020] border-white/[0.07] focus-visible:ring-primary pl-9"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/[0.05] flex justify-end">
              <Button
                onClick={handleSave}
                disabled={updateProfile.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              >
                {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
