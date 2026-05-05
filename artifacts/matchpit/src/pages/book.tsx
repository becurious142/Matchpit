import { useParams } from "wouter";
import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useGetVenue, useGetVenueSlots, useCreatePaymentOrder, useVerifyPayment, useCreateBooking } from "@workspace/api-client-react";
import type { Slot } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, MapPin, CheckCircle2, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { loadRazorpay } from "@/lib/razorpay";

type EnrichedSlot = Slot & { computedPrice?: number };
type EnrichedSlotDay = { date: string; slots: EnrichedSlot[] };

interface WalletData { balance: number; walletAutoUse: boolean; }

export default function Book() {
  const { venueId } = useParams<{ venueId: string }>();

  // Read slot IDs from query string — works regardless of wouter base path
  const rawSearch = typeof window !== 'undefined' ? window.location.search : '';
  const selectedSlotIds = new URLSearchParams(rawSearch).get('slots')?.split(',').filter(Boolean) ?? [];

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [useWallet, setUseWallet] = useState<boolean | null>(null);

  const { data: venue, isLoading: loadingVenue } = useGetVenue(venueId!);

  const fromDate = format(new Date(), 'yyyy-MM-dd');
  const { data: slotsData } = useGetVenueSlots(venueId!, { from: fromDate });

  const enrichedSlotsData = slotsData as EnrichedSlotDay[] | undefined;
  const allSlots = enrichedSlotsData?.flatMap(d => d.slots) ?? [];
  const selectedSlots = selectedSlotIds
    .map(id => allSlots.find(s => s.id === id))
    .filter((s): s is EnrichedSlot => s !== undefined);

  const { data: walletData } = useQuery<WalletData>({
    queryKey: ["wallet-mini"],
    queryFn: async () => {
      const res = await fetch("/api/wallet");
      if (!res.ok) return { balance: 0, walletAutoUse: false };
      const data = await res.json();
      return { balance: data.balance, walletAutoUse: data.walletAutoUse };
    },
  });

  const createPaymentOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();
  const createBooking = useCreateBooking();

  const sport = selectedSport || (venue?.sports?.[0] ?? "");

  // Timings derived from selected slots
  const startTime = selectedSlots[0]?.startTime ?? "";
  const endTime = selectedSlots[selectedSlots.length - 1]?.endTime ?? "";
  const slotDate = selectedSlots[0]?.date ?? "";
  const durationHours = selectedSlots.length;

  // Pricing — sum of server-computed prices per slot
  const venueCharge = selectedSlots.reduce(
    (acc, s) => acc + (s.computedPrice ?? s.priceOverride ?? venue?.pricePerHour ?? 0),
    0
  );
  const cashbackAmount = Math.floor(venueCharge * 0.03);

  const walletBalance = walletData?.balance ?? 0;
  const walletEnabled = useWallet ?? (walletData?.walletAutoUse ?? false);
  const walletAmountUsed = walletEnabled ? Math.min(walletBalance, venueCharge) : 0;
  const totalPayable = Math.max(0, venueCharge - walletAmountUsed);

  const handleWalletOnlyPayment = async () => {
    if (!venue || selectedSlotIds.length === 0) return;
    setIsProcessing(true);
    try {
      await createBooking.mutateAsync({
        data: {
          venueId: venue.id,
          slotIds: selectedSlotIds,
          sport,
          razorpayOrderId: `wallet_${Date.now()}`,
          razorpayPaymentId: "",
          razorpaySignature: "",
          walletAmountUsed: venueCharge,
        } as any,
      });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["getVenueSlots", venueId] });
      await queryClient.invalidateQueries({ queryKey: ["wallet"] });
      setIsSuccess(true);
      toast({ title: "Booking Confirmed! 🎯", description: "Paid with wallet balance." });
      setTimeout(() => { setRedirect(true); window.location.href = "/dashboard/bookings"; }, 3000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to book", variant: "destructive" });
      setIsProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!venue || selectedSlotIds.length === 0) return;

    if (totalPayable === 0) {
      await handleWalletOnlyPayment();
      return;
    }

    setIsProcessing(true);
    try {
      const order = await createPaymentOrder.mutateAsync({
        data: {
          type: "booking",
          venueId: venue.id,
          slotIds: selectedSlotIds,
          walletAmountUsed: walletAmountUsed > 0 ? walletAmountUsed : undefined,
        } as any,
      });

      const isLoaded = await loadRazorpay();
      if (!isLoaded) throw new Error("Razorpay SDK failed to load");

      const options = {
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "MATCHPIT",
        description: `Booking: ${venue.name}`,
        order_id: order.orderId,
        prefill: {
          name: order.prefillName || "",
          email: order.prefillEmail || "",
          contact: order.prefillContact || "",
        },
        theme: { color: "#84cc16" },
        handler: async function (response: any) {
          try {
            await verifyPayment.mutateAsync({
              data: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                type: "booking",
                referenceId: venue.id,
              },
            });

            await createBooking.mutateAsync({
              data: {
                venueId: venue.id,
                slotIds: selectedSlotIds,
                sport,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                walletAmountUsed: walletAmountUsed > 0 ? walletAmountUsed : undefined,
              } as any,
            });

            await queryClient.invalidateQueries({ queryKey: ["bookings"] });
            await queryClient.invalidateQueries({ queryKey: ["getVenueSlots", venueId] });

            setIsSuccess(true);
            toast({
              title: "Booking Confirmed! 🎯",
              description: "Your turf has been booked successfully.",
            });
            setTimeout(() => { window.location.href = "/dashboard/bookings"; }, 3000);
          } catch (err: any) {
            toast({
              title: "Verification failed",
              description: err.message || "Failed to verify payment",
              variant: "destructive",
            });
            setIsProcessing(false);
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        setIsProcessing(false);
        toast({
          title: "Payment Failed",
          description: response.error.description,
          variant: "destructive",
        });
      });

      rzp.open();
    } catch (err: any) {
      setIsProcessing(false);
      toast({
        title: "Error",
        description: err.message || "Failed to initialize payment",
        variant: "destructive",
      });
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 text-center">
        <CheckCircle2 className="w-24 h-24 text-primary mb-6 animate-bounce" />
        <h1 className="text-4xl font-extrabold uppercase italic mb-4">You're <span className="text-primary">In</span>!</h1>
        <p className="text-muted-foreground text-lg max-w-md mb-8">
          Your booking at {venue?.name} is confirmed. We've sent the details to your email.
        </p>
        <Button size="lg" className="font-bold px-8 uppercase italic" onClick={() => { window.location.href = "/dashboard/bookings"; }}>
          View Bookings
        </Button>
      </div>
    );
  }

  if (!loadingVenue && (!venue || selectedSlots.length === 0)) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p className="text-lg font-medium">No slots selected.</p>
        <Button className="mt-4 font-bold uppercase italic" onClick={() => window.history.back()}>Go Back</Button>
      </div>
    );
  }

  if (!venue || selectedSlots.length === 0) return null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-extrabold uppercase italic mb-8">Checkout</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <Card className="bg-card/50 backdrop-blur border-border/50 overflow-hidden">
            <div className="h-32 bg-muted relative">
              <img src={venue.coverImage || `/venues/venue1.png`} alt={venue.name} className="w-full h-full object-cover opacity-50" />
              <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
              <div className="absolute bottom-4 left-4">
                <h2 className="text-2xl font-bold uppercase italic">{venue.name}</h2>
              </div>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-1">Location</p>
                      <p className="font-medium">{venue.address}</p>
                      <p className="text-sm text-muted-foreground">{venue.city}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {slotDate && (
                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-1">Date</p>
                        <p className="font-medium">{format(parseISO(slotDate), 'EEEE, MMMM do, yyyy')}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-1">Time</p>
                      <p className="font-medium">{startTime} to {endTime}</p>
                      <p className="text-xs text-muted-foreground">{durationHours} hr{durationHours > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Slot breakdown */}
              {selectedSlots.length > 1 && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-3">Slot Breakdown</p>
                  <div className="space-y-1">
                    {selectedSlots.map(s => (
                      <div key={s.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{s.startTime} – {s.endTime}</span>
                        <span className="font-medium">₹{s.computedPrice ?? s.priceOverride ?? venue.pricePerHour}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {venue.sports.length > 1 && (
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-6">
                <h3 className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-4">Select Sport</h3>
                <div className="flex flex-wrap gap-3">
                  {venue.sports.map((s) => {
                    const sportMeta: Record<string, { label: string; icon: string }> = {
                      football: { label: "Football", icon: "⚽" },
                      cricket: { label: "Cricket", icon: "🏏" },
                      badminton: { label: "Badminton", icon: "🏸" },
                      tennis: { label: "Tennis", icon: "🎾" },
                      basketball: { label: "Basketball", icon: "🏀" },
                      volleyball: { label: "Volleyball", icon: "🏐" },
                      hockey: { label: "Hockey", icon: "🏑" },
                    };
                    const meta = sportMeta[s] ?? { label: s, icon: "🏆" };
                    const isSelected = sport === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedSport(s)}
                        className={`px-4 py-2 rounded-xl border-2 font-bold text-sm transition-all flex items-center gap-2 ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shrink-0">
              <span className="text-black font-bold text-xl">ℹ️</span>
            </div>
            <div>
              <h4 className="font-bold text-primary mb-1">Cancellation Policy</h4>
              <p className="text-sm text-muted-foreground">Free cancellation up to 4 hours before the slot time. After that, a 50% fee applies.</p>
            </div>
          </div>
        </div>

        <div className="md:col-span-1">
          <Card className="sticky top-24 bg-card border-border/50 shadow-xl">
            <CardContent className="p-6">
              <h3 className="font-bold uppercase tracking-wider mb-6">Payment Summary</h3>

              <div className="space-y-3 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Venue charge ({durationHours} hr{durationHours > 1 ? 's' : ''})
                  </span>
                  <span className="font-medium">₹{venueCharge}</span>
                </div>
                {walletAmountUsed > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Wallet credit applied</span>
                    <span className="font-bold">−₹{walletAmountUsed.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-primary/80">
                  <span>Cashback you'll earn (3%)</span>
                  <span className="font-bold">+₹{cashbackAmount}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total payable</span>
                  <span className="text-primary">₹{totalPayable.toFixed(2)}</span>
                </div>
              </div>

              {walletBalance > 0 && (
                <div className="flex items-center justify-between p-3 mb-4 rounded-xl border border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />
                    <div>
                      <p className="font-bold text-xs">Use Wallet</p>
                      <p className="text-[10px] text-muted-foreground">₹{walletBalance.toFixed(2)} available</p>
                    </div>
                  </div>
                  <Switch
                    checked={walletEnabled}
                    onCheckedChange={(v) => setUseWallet(v)}
                    disabled={isProcessing}
                  />
                </div>
              )}

              <Button
                className="w-full h-14 text-lg font-bold uppercase italic shadow-lg shadow-primary/20"
                size="lg"
                onClick={handlePayment}
                disabled={isProcessing}
              >
                {isProcessing
                  ? "Processing..."
                  : totalPayable === 0
                  ? "Pay with Wallet"
                  : `Pay ₹${totalPayable.toFixed(2)}`}
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-4">
                Secure payments powered by Razorpay
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
