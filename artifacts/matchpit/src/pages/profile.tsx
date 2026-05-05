import { useQuery } from "@tanstack/react-query";
import { useGetMyProfile, useUpdateMyProfile } from "@workspace/api-client-react";
import { BadgeDisplay } from "@/components/BadgeDisplay";
import { TrustScoreBar } from "@/components/TrustBadge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useRef } from "react";

const profileSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().optional(),
  city: z.string().min(2, "City is required"),
  favoriteSports: z.array(z.string()).min(1, "Select at least one sport")
});

export default function Profile() {
  const { data: profile, isLoading } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();
  const { toast } = useToast();

  const initialized = useRef(false);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      city: "",
      favoriteSports: []
    }
  });

  useEffect(() => {
    if (profile && !initialized.current) {
      form.reset({
        fullName: profile.fullName || "",
        phone: profile.phone || "",
        city: profile.city || "Jaipur",
        favoriteSports: profile.favoriteSports || ["football"]
      });
      initialized.current = true;
    }
  }, [profile, form]);

  const { data: badges } = useQuery<any[]>({
    queryKey: ["profile-badges"],
    queryFn: async () => {
      const res = await fetch("/api/profile/badges");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!profile,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["profile-stats"],
    queryFn: async () => {
      const res = await fetch("/api/profile/stats");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!profile,
  });

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    try {
      await updateProfile.mutateAsync({ data: values });
      toast({ title: "Success", description: "Profile updated successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const availableSports = [
    { id: "cricket",     label: "Cricket",     icon: "🏏" },
    { id: "box_cricket", label: "Box Cricket",  icon: "📦" },
    { id: "football",    label: "Football",     icon: "⚽" },
    { id: "badminton",   label: "Badminton",    icon: "🏸" },
    { id: "pickleball",  label: "Pickleball",   icon: "🏓" },
  ];

  if (isLoading) {
    return <div className="container max-w-2xl py-12"><Skeleton className="h-[500px] w-full" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl min-h-screen">
      <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-8">Player <span className="text-primary">Profile</span></h1>

      {stats && (
        <div className="mb-8">
          <TrustScoreBar
            score={stats.trustScore ?? 100}
            noShowCount={stats.noShowCount ?? 0}
            completedBookings={stats.completedBookings ?? 0}
            cancelledBookings={stats.cancelledBookings ?? 0}
          />
        </div>
      )}

      <Card className="bg-card/50 border-border/50 backdrop-blur">
        <CardContent className="p-6 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

              <div className="space-y-2 mb-6">
                <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Email (Read Only)</div>
                <div className="font-mono text-sm bg-muted p-3 rounded-md border border-border/50">{profile?.email}</div>
              </div>

              {(profile as any)?.referralCode && (
                <div className="space-y-2 mb-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Your Referral Code</div>
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-lg font-bold tracking-widest text-primary bg-background p-3 rounded-md border border-primary/30 flex-1">
                      {(profile as any).referralCode}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText((profile as any).referralCode);
                        toast({ title: "Copied!", description: "Referral code copied to clipboard." });
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="w-full flex items-center justify-center gap-2 mt-2 py-2 rounded-lg border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/5 text-sm font-bold transition-colors"
                    onClick={() => {
                      const text = encodeURIComponent(
                        `Join me on MATCHPIT — India's best sports booking app!\nUse my referral code ${(profile as any).referralCode} to get ₹50 wallet bonus on signup.\n\nhttps://matchpit.in`
                      );
                      window.open(`https://wa.me/?text=${text}`, "_blank");
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    Share on WhatsApp
                  </button>
                  <p className="text-xs text-muted-foreground">Share this code with friends to earn ₹100 when they complete their first booking.</p>
                </div>
              )}

              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Full Name</FormLabel>
                    <FormControl><Input {...field} className="h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider">Phone</FormLabel>
                      <FormControl><Input {...field} className="h-12" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider">City</FormLabel>
                      <FormControl><Input {...field} className="h-12" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="favoriteSports"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Favorite Sports</FormLabel>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {availableSports.map((sport) => {
                        const isSelected = field.value.includes(sport.id);
                        return (
                          <div
                            key={sport.id}
                            className={`px-4 py-2 rounded-full border cursor-pointer text-sm font-bold transition-colors ${
                              isSelected
                                ? "bg-primary text-black border-primary"
                                : "bg-transparent border-border text-muted-foreground hover:border-primary/50"
                            }`}
                            onClick={() => {
                              const newValue = isSelected
                                ? field.value.filter(s => s !== sport.id)
                                : [...field.value, sport.id];
                              field.onChange(newValue);
                            }}
                          >
                            <span className="mr-1">{sport.icon}</span> {sport.label}
                          </div>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-14 text-lg font-bold uppercase italic mt-8"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {badges && badges.length > 0 && (
        <div className="mt-8">
          <h2 className="text-2xl font-extrabold uppercase italic tracking-tighter mb-4">
            Your <span className="text-primary">Badges</span>
          </h2>
          <BadgeDisplay badges={badges} />
        </div>
      )}
    </div>
  );
}
