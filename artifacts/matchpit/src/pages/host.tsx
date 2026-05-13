import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListSports,
  useListVenues,
  useGetVenueSlots,
  useCreateHostedMatch,
  useCreatePaymentOrder
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, MapPin, Users, Trophy, CheckCircle } from "lucide-react";
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

// ─── Slot Card ────────────────────────────────────────────────────────────────

function SlotCard({
  slot,
  selected,
  onClick,
}: {
  slot: { id: string; startTime: string; endTime: string; status: string; computedPrice?: number; priceOverride?: number | null };
  selected: boolean;
  onClick: () => void;
}) {
  const available = slot.status === "available";
  const price = slot.computedPrice ?? (slot.priceOverride != null ? Number(slot.priceOverride) : null);

  // Compute duration label
  const [sh, sm] = slot.startTime.split(":").map(Number);
  const [eh, em] = slot.endTime.split(":").map(Number);
  const durationMins = (eh * 60 + em) - (sh * 60 + (sm ?? 0));
  const durationLabel = durationMins >= 60
    ? `${durationMins / 60}h`
    : `${durationMins}m`;

  return (
    <button
      type="button"
      disabled={!available}
      onClick={onClick}
      className={`relative flex flex-col gap-1 p-4 rounded-xl border-2 text-left transition-all duration-150 ${
        !available
          ? "border-border/30 bg-muted/30 opacity-50 cursor-not-allowed"
          : selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 bg-card/50 hover:border-primary/50 cursor-pointer"
      }`}
    >
      {selected && (
        <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-primary" />
      )}
      <div className="font-bold text-sm">
        {slot.startTime} – {slot.endTime}
      </div>
      <div className="text-xs text-muted-foreground">{durationLabel}</div>
      {price != null && (
        <div className={`text-xs font-bold mt-1 ${selected ? "text-primary" : "text-foreground"}`}>
          ₹{price}
        </div>
      )}
      {!available && (
        <div className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Booked</div>
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HostMatch() {
  const { getToken } = useAuth();
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
      date: format(new Date(), "yyyy-MM-dd"),
      slotId: "",
      skillLevel: "any",
      totalPlayers: 10,
      notes: "",
    },
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

  const selectedVenue = venuesData?.venues.find((v) => v.id === watchVenueId);
  const availableSlots = slotsData?.[0]?.slots ?? [];
  const selectedSlot = availableSlots.find((s) => s.id === watchSlotId);

  // Commerce Math — mirrors backend exactly:
  // reserveFee = ceil(totalVenueCost / totalPlayers / 2)
  // finalFeePerPlayer = ceil(totalVenueCost / totalPlayers) - reserveFee
  // hostFee = 49 (fixed platform fee)
  const hostFee = 49;
  const venuePrice =
    selectedSlot?.computedPrice ??
    (selectedSlot?.priceOverride != null ? Number(selectedSlot.priceOverride) : null) ??
    selectedVenue?.pricePerHour ??
    0;
  const reserveFeePerPlayer = Math.ceil(venuePrice / watchTotalPlayers / 2);
  const finalEstPerPlayer = Math.ceil(venuePrice / watchTotalPlayers) - reserveFeePerPlayer;
  const totalAmountToPayNow = hostFee + reserveFeePerPlayer;

  const createMatch = useCreateHostedMatch();
  const createPaymentOrder = useCreatePaymentOrder();

  const onSubmit = async (values: z.infer<typeof hostSchema>) => {
    if (step < 3) {
      setStep(step + 1);
      return;
    }

    setIsProcessing(true);
    try {
      // Step 1: Create payment order — backend computes amount from slot/venue/players
      // type "host_match_create" tells the backend to skip hosted_matches lookup
      // and store match metadata in the payment row for post-payment creation.
      const order = await createPaymentOrder.mutateAsync({
        data: {
          type: "host_match_create" as any,
          venueId: values.venueId,
          slotId: values.slotId,
          sport: values.sport,
          totalPlayers: Number(values.totalPlayers),
          minPlayers: Math.max(2, Math.ceil(values.totalPlayers * 0.6)),
          skillLevel: values.skillLevel,
          notes: values.notes ?? "",
          amount: 0, // backend ignores this for host_match_create
        } as any,
      });

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
            // Step 4: Create the match atomically — backend verifies payment
            // signature and creates the hosted match in a single transaction.
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
              },
            });

            toast({
              title: "Match Created! 🎯",
              description: "Your match is now live and open for players to join.",
            });
            setLocation(`/matches/${match.id}`);
          } catch (err: any) {
            toast({
              title: "Match creation failed",
              description: err.message,
              variant: "destructive",
            });
          } finally {
            setIsProcessing(false);
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", () => {
        setIsProcessing(false);
        toast({
          title: "Payment cancelled",
          description: "No charge was made.",
          variant: "destructive",
        });
      });
      rzp.open();
    } catch (err: any) {
      setIsProcessing(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const dates = Array.from({ length: 14 }).map((_, i) => {
    const d = addDays(new Date(), i);
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "EEE, MMM d") };
  });

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl min-h-screen">
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-2">
          Host a <span className="text-primary">Match</span>
        </h1>
        <p className="text-muted-foreground">Book a turf, set the rules, and let players come to you.</p>
      </div>

      {/* Progress Steps */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-2 flex-1 rounded-full ${step >= i ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          {/* ── STEP 1: Venue & Time ─────────────────────────────────────────── */}
          <div className={step === 1 ? "block" : "hidden"}>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-6 space-y-6">

                {/* Sport */}
                <FormField
                  control={form.control}
                  name="sport"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider">Select Sport</FormLabel>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {sports?.map((s) => (
                          <div
                            key={s.slug}
                            onClick={() => {
                              field.onChange(s.slug);
                              form.setValue("venueId", "");
                              form.setValue("slotId", "");
                            }}
                            className={`p-4 rounded-xl border-2 cursor-pointer flex flex-col items-center justify-center gap-2 transition-all ${
                              field.value === s.slug
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:border-primary/50"
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

                {/* Venue */}
                {watchSport && (
                  <FormField
                    control={form.control}
                    name="venueId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-wider">Select Venue</FormLabel>
                        <Select
                          onValueChange={(v) => {
                            field.onChange(v);
                            form.setValue("slotId", "");
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-14">
                              <SelectValue placeholder="Choose a turf..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {venuesData?.venues.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">{v.name}</span>
                                  <span className="text-muted-foreground text-xs">
                                    — {v.city} (₹{v.pricePerHour}/hr)
                                  </span>
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

                {/* Date */}
                {watchVenueId && (
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                          <Calendar className="w-4 h-4" /> Select Date
                        </FormLabel>
                        <Select
                          onValueChange={(v) => {
                            field.onChange(v);
                            form.setValue("slotId", "");
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-14">
                              <SelectValue placeholder="Select Date" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {dates.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Slot Cards */}
                {watchVenueId && watchDate && (
                  <FormField
                    control={form.control}
                    name="slotId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                          <Clock className="w-4 h-4" /> Available Slots
                        </FormLabel>
                        {availableSlots.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            No slots available for this date.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                            {availableSlots.map((s) => (
                              <SlotCard
                                key={s.id}
                                slot={s}
                                selected={field.value === s.id}
                                onClick={() => field.onChange(s.id)}
                              />
                            ))}
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── STEP 2: Match Details ────────────────────────────────────────── */}
          <div className={step === 2 ? "block" : "hidden"}>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-6 space-y-6">
                <FormField
                  control={form.control}
                  name="totalPlayers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider">
                        Total Players Needed
                      </FormLabel>
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
                        {["any", "beginner", "intermediate", "advanced"].map((level) => (
                          <div
                            key={level}
                            onClick={() => field.onChange(level)}
                            className={`p-3 rounded-xl border text-center cursor-pointer font-bold uppercase text-sm transition-all ${
                              field.value === level
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:border-primary/50"
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
                      <FormLabel className="text-xs font-bold uppercase tracking-wider">
                        Host Notes (Optional)
                      </FormLabel>
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

          {/* ── STEP 3: Review & Pay ─────────────────────────────────────────── */}
          <div className={step === 3 ? "block" : "hidden"}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="p-6">
                  <h3 className="font-bold uppercase mb-4 text-primary">Match Details</h3>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Venue
                      </span>
                      <span className="font-bold text-right">{selectedVenue?.name}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Date & Time
                      </span>
                      <span className="font-bold text-right">
                        {watchDate ? format(parseISO(watchDate), "MMM d") : ""} •{" "}
                        {selectedSlot?.startTime}–{selectedSlot?.endTime}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Users className="w-4 h-4" /> Players
                      </span>
                      <span className="font-bold text-right">{watchTotalPlayers} total</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Trophy className="w-4 h-4" /> Level
                      </span>
                      <span className="font-bold text-right capitalize">
                        {form.getValues("skillLevel")}
                      </span>
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
                      <span className="text-muted-foreground">Turf Cost</span>
                      <span className="font-bold">₹{venuePrice}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Players</span>
                      <span className="font-bold">{watchTotalPlayers}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Reserve Fee</span>
                      <span className="font-bold">₹{reserveFeePerPlayer}/player</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Final Share</span>
                      <span className="font-bold">~₹{finalEstPerPlayer}/player</span>
                    </div>
                  </div>

                  <div className="bg-muted/50 p-4 rounded-xl mb-4 border border-border">
                    <h4 className="text-[10px] uppercase font-bold text-muted-foreground mb-3 tracking-wider">
                      Due Today to Host
                    </h4>
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
                      <span className="text-2xl font-extrabold text-primary">
                        ₹{totalAmountToPayNow}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Players pay their reserve fee to join. Once minimum players are in, everyone pays
                    the final share and the venue is locked. Full refund if the match doesn't fill.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex gap-4 pt-6 border-t border-border/50">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                className="h-14 px-8 font-bold uppercase italic"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            <Button
              type="submit"
              className="h-14 flex-1 font-bold uppercase italic text-lg shadow-lg shadow-primary/20"
              disabled={isProcessing || (step === 1 && !watchSlotId)}
            >
              {isProcessing
                ? "Processing..."
                : step < 3
                ? "Next Step"
                : `Pay ₹${totalAmountToPayNow} & Host`}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
