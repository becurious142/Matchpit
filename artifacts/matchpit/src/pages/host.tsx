import { useLocation } from "wouter";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListSports,
  useListVenues,
  useGetVenueSlots,
  useVerifyPayment,
  useCreateHostedMatch
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, MapPin, Users, Trophy } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { loadRazorpay } from "@/lib/razorpay";

const hostSchema = z.object({
  sport: z.string().min(1, "Select a sport"),
  venueId: z.string().min(1, "Select a venue"),
  date: z.string().min(1, "Select a date"),
  slotId: z.string().min(1, "Select a slot"),
  skillLevel: z.enum(["beginner", "intermediate", "advanced", "any"]),
  totalPlayers: z.coerce.number().min(2).max(50),
  notes: z.string().optional()
});

export default function HostMatch() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const preselectedVenueId = searchParams.get("venue");
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const form = useForm<z.infer<typeof hostSchema>>({
    resolver: zodResolver(hostSchema),
    defaultValues: {
      sport: "",
      venueId: preselectedVenueId || "",
      date: format(new Date(), 'yyyy-MM-dd'),
      slotId: "",
      skillLevel: "any",
      totalPlayers: 10,
      notes: ""
    }
  });

  const watchSport = form.watch("sport");
  const watchVenueId = form.watch("venueId");
  const watchDate = form.watch("date");
  const watchSlotId = form.watch("slotId");
  const watchTotalPlayers = form.watch("totalPlayers");

  // Data fetching
  const { data: sports } = useListSports();
  const { data: venuesData } = useListVenues({ sport: watchSport || undefined });
  const { data: slotsData } = useGetVenueSlots(watchVenueId, { from: watchDate, to: watchDate });

  const selectedVenue = venuesData?.venues.find(v => v.id === watchVenueId);
  const availableSlots = slotsData?.[0]?.slots || [];
  const selectedSlot = availableSlots.find(s => s.id === watchSlotId);

  // Commerce Math — mirrors backend exactly:
  // backend: reserveFee = Math.ceil(totalVenueCost / totalPlayers / 2)
  // backend: finalFeePerPlayer = Math.ceil(totalVenueCost / totalPlayers)
  // backend: hostFee = 99 (fixed platform fee)
  const hostFee = 99;
  const venuePrice = selectedSlot?.priceOverride || selectedVenue?.pricePerHour || 0;
  const reserveFeePerPlayer = Math.ceil(venuePrice / watchTotalPlayers / 2);
  const finalEstPerPlayer = Math.ceil(venuePrice / watchTotalPlayers);
  const totalAmountToPayNow = hostFee + reserveFeePerPlayer;

  const verifyPayment = useVerifyPayment();
  const createMatch = useCreateHostedMatch();

  const onSubmit = async (values: z.infer<typeof hostSchema>) => {
    if (step < 3) {
      setStep(step + 1);
      return;
    }

    setIsProcessing(true);
    try {
      // ── SAFE ATOMIC FLOW ──────────────────────────────────────────────────
      // Step 1: Get a Razorpay order from the backend using real slot/venue data.
      //         No tempRefId — the backend validates slot availability here.
      const orderRes = await fetch("/api/hosted-matches/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: values.venueId,
          slotId: values.slotId,
          totalPlayers: values.totalPlayers,
        }),
      });
      if (!orderRes.ok) {
        const err = await orderRes.json();
        throw new Error(err.message ?? "Failed to create payment order");
      }
      const order = await orderRes.json();

      // Step 2: Load Razorpay SDK
      const isLoaded = await loadRazorpay();
      if (!isLoaded) throw new Error("Razorpay SDK failed to load");

      // Step 3: Open Razorpay checkout
      const options = {
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "MATCHPIT",
        description: `Host Match: ${selectedVenue?.name}`,
        order_id: order.orderId,
        theme: { color: "#84cc16" },
        handler: async function (response: any) {
          try {
            // Step 4: Verify payment signature
            await verifyPayment.mutateAsync({
              data: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                type: "host_commitment",
                referenceId: response.razorpay_order_id, // backend will update with real matchId
              }
            });

            // Step 5: Create the match — backend creates payment record + match atomically
            const minPlayers = Math.max(2, Math.ceil(values.totalPlayers * 0.6));
            const match = await createMatch.mutateAsync({
              data: {
                venueId: values.venueId,
                slotId: values.slotId,
                sport: values.sport,
                totalPlayers: values.totalPlayers,
                minPlayers,
                skillLevel: values.skillLevel as any,
                notes: values.notes,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }
            });

            toast({ title: "Match Created! 🎯", description: "Your match is now live and open for players to join." });
            setLocation(`/matches/${match.id}`);
          } catch (err: any) {
            toast({ title: "Match creation failed", description: err.message, variant: "destructive" });
          } finally {
            setIsProcessing(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", () => {
        setIsProcessing(false);
        toast({ title: "Payment cancelled", description: "No charge was made.", variant: "destructive" });
      });
      rzp.open();

    } catch (err: any) {
      setIsProcessing(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const dates = Array.from({ length: 14 }).map((_, i) => {
    const d = addDays(new Date(), i);
    return { value: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE, MMM d') };
  });

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl min-h-screen">
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-2">Host a <span className="text-primary">Match</span></h1>
        <p className="text-muted-foreground">Book a turf, set the rules, and let players come to you.</p>
      </div>

      {/* Progress Steps */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-2 flex-1 rounded-full ${step >= i ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          {/* STEP 1: Venue & Time */}
          <div className={step === 1 ? 'block' : 'hidden'}>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-6 space-y-6">
                <FormField
                  control={form.control}
                  name="sport"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider">Select Sport</FormLabel>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {sports?.map(s => (
                          <div 
                            key={s.slug}
                            onClick={() => {
                              field.onChange(s.slug);
                              form.setValue("venueId", ""); // Reset venue on sport change
                            }}
                            className={`p-4 rounded-xl border-2 cursor-pointer flex flex-col items-center justify-center gap-2 transition-all ${
                              field.value === s.slug ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <span className="text-2xl">{s.icon}</span>
                            <span className="font-bold text-sm">{s.label}</span>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchSport && (
                  <FormField
                    control={form.control}
                    name="venueId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-wider">Select Venue</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-14">
                              <SelectValue placeholder="Choose a turf..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {venuesData?.venues.map(v => (
                              <SelectItem key={v.id} value={v.id}>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">{v.name}</span>
                                  <span className="text-muted-foreground text-xs">— {v.city} (₹{v.pricePerHour}/hr)</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {watchVenueId && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase tracking-wider">Date</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-14">
                                <SelectValue placeholder="Select Date" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {dates.map(d => (
                                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="slotId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase tracking-wider">Time Slot</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-14">
                                <SelectValue placeholder="Select Time" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {availableSlots.length > 0 ? (
                                availableSlots.map(s => (
                                  <SelectItem key={s.id} value={s.id} disabled={s.status !== 'available'}>
                                    {s.startTime} - {s.endTime} {s.status !== 'available' ? '(Booked)' : ''}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none" disabled>No slots available</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* STEP 2: Match Details */}
          <div className={step === 2 ? 'block' : 'hidden'}>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-6 space-y-6">
                <FormField
                  control={form.control}
                  name="totalPlayers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider">Total Players Needed</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="h-14 text-lg font-bold" />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Once minimum players join, everyone pays the final share and the venue gets locked automatically.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="skillLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider">Skill Level</FormLabel>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {['any', 'beginner', 'intermediate', 'advanced'].map(level => (
                          <div 
                            key={level}
                            onClick={() => field.onChange(level)}
                            className={`p-3 rounded-xl border text-center cursor-pointer font-bold uppercase text-sm transition-all ${
                              field.value === level ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                            }`}
                          >
                            {level}
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider">Host Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="E.g. Bring your own studs, strictly advanced players..." 
                          className="resize-none h-24"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* STEP 3: Review & Pay */}
          <div className={step === 3 ? 'block' : 'hidden'}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="p-6">
                  <h3 className="font-bold uppercase mb-4 text-primary">Match Details</h3>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="text-muted-foreground flex items-center gap-2"><MapPin className="w-4 h-4"/> Venue</span>
                      <span className="font-bold text-right">{selectedVenue?.name}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="text-muted-foreground flex items-center gap-2"><Calendar className="w-4 h-4"/> Date & Time</span>
                      <span className="font-bold text-right">
                        {watchDate ? format(parseISO(watchDate), 'MMM d') : ''} • {selectedSlot?.startTime}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="text-muted-foreground flex items-center gap-2"><Users className="w-4 h-4"/> Players</span>
                      <span className="font-bold text-right">{watchTotalPlayers} total</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-2"><Trophy className="w-4 h-4"/> Level</span>
                      <span className="font-bold text-right capitalize">{form.getValues('skillLevel')}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-primary/30 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
                <CardContent className="p-6 relative z-10">
                  <h3 className="font-bold uppercase mb-6 text-primary">Commerce Math</h3>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Turf Cost</span>
                      <span className="font-bold">₹{venuePrice}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Est. Cost Per Player</span>
                      <span className="font-bold">~₹{finalEstPerPlayer}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Reserve Fee (Upfront)</span>
                      <span className="font-bold">₹{reserveFeePerPlayer} / player</span>
                    </div>
                  </div>

                  <div className="bg-muted/50 p-4 rounded-xl mb-4 border border-border">
                    <h4 className="text-[10px] uppercase font-bold text-muted-foreground mb-3 tracking-wider">Due Today to Host</h4>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Platform Host Fee</span>
                      <span className="font-bold">₹{hostFee}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-4">
                      <span>Your Reserve Fee</span>
                      <span className="font-bold">₹{reserveFeePerPlayer}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-border/50">
                      <span className="font-bold uppercase">Total</span>
                      <span className="text-2xl font-extrabold text-primary">₹{totalAmountToPayNow}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Players pay their reserve fee to join. Once minimum players are in, everyone pays the final share and the venue is locked. Full refund if the match doesn't fill.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex gap-4 pt-6 border-t border-border/50">
            {step > 1 && (
              <Button type="button" variant="outline" className="h-14 px-8 font-bold uppercase italic" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button 
              type="submit" 
              className="h-14 flex-1 font-bold uppercase italic text-lg shadow-lg shadow-primary/20"
              disabled={isProcessing || (step === 1 && !watchSlotId)}
            >
              {isProcessing ? "Processing..." : step < 3 ? "Next Step" : `Pay ₹${totalAmountToPayNow} & Host`}
            </Button>
          </div>

        </form>
      </Form>
    </div>
  );
}