import { useGetMyProfile, useUpdateMyProfile } from "@workspace/api-client-react";
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

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    try {
      await updateProfile.mutateAsync({
        data: values
      });
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
                  <p className="text-xs text-muted-foreground">Share this code with friends to earn rewards when they complete their first booking.</p>
                </div>
              )}

              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Full Name</FormLabel>
                    <FormControl>
                      <Input {...field} className="h-12" />
                    </FormControl>
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
                      <FormControl>
                        <Input {...field} className="h-12" />
                      </FormControl>
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
                      <FormControl>
                        <Input {...field} className="h-12" />
                      </FormControl>
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
    </div>
  );
}