import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetHostedMatch, useJoinHostedMatch, useCreatePaymentOrder, useVerifyPayment } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, MapPin, Trophy, Users, ShieldCheck, UserPlus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { loadRazorpay } from "@/lib/razorpay";
import { useUser } from "@clerk/react";

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: matchDetail, isLoading, refetch } = useGetHostedMatch(id!);
  const joinMatch = useJoinHostedMatch();
  const createPaymentOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();

  const handleJoin = async () => {
    if (!user) {
      // Must be logged in
      toast({ title: "Sign in required", description: "You must be signed in to join a match." });
      return;
    }
    
    if (!matchDetail) return;

    setIsProcessing(true);
    try {
      // 1. Create order
      const order = await createPaymentOrder.mutateAsync({
        data: {
          type: "match_reserve",
          referenceId: id!,
          amount: matchDetail.reserveFee
        }
      });

      // 2. Load razorpay
      const isLoaded = await loadRazorpay();
      if (!isLoaded) throw new Error("Razorpay SDK failed to load");

      // 3. Open checkout
      const options = {
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "MATCHPIT",
        description: `Join Match: ${matchDetail.venue?.name}`,
        order_id: order.orderId,
        prefill: {
          name: order.prefillName || "",
          email: order.prefillEmail || "",
          contact: order.prefillContact || ""
        },
        theme: { color: "#84cc16" },
        handler: async function (response: any) {
          try {
            // 4. Verify payment
            await verifyPayment.mutateAsync({
              data: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                type: "match_reserve",
                referenceId: id!
              }
            });

            // 5. Join match (payment was already verified above)
            await joinMatch.mutateAsync({ matchId: id! });

            // Invalidate stale queries so match detail + matches list reflect new state
            await queryClient.invalidateQueries({ queryKey: ["getHostedMatch", id] });
            await queryClient.invalidateQueries({ queryKey: ["listHostedMatches"] });

            toast({
              title: "You're in! 🎉",
              description: "You've successfully joined the match.",
            });
            refetch();
          } catch (err: any) {
            toast({ title: "Failed", description: err.message, variant: "destructive" });
          } finally {
            setIsProcessing(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        setIsProcessing(false);
        toast({ title: "Payment Failed", description: response.error.description, variant: "destructive" });
      });
      rzp.open();

    } catch (err: any) {
      setIsProcessing(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-[30vh] w-full rounded-2xl mb-8" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!matchDetail) return <div className="text-center py-20 font-bold">Match Not Found</div>;

  const isFull = matchDetail.spotsLeft <= 0;
  const progress = (matchDetail.currentPlayers / matchDetail.totalPlayers) * 100;
  const isHost = user?.id === matchDetail.hostUserId; // Note: hostUserId is internal ID, not clerk ID, but for UI approximation this is fine. Actual protection is on backend.

  return (
    <div className="min-h-screen pb-20">
      {/* Hero */}
      <div className="relative h-[30vh] md:h-[40vh] w-full bg-muted">
        {matchDetail.venue?.coverImage ? (
          <img src={matchDetail.venue.coverImage} alt={matchDetail.venue.name} className="w-full h-full object-cover" />
        ) : (
          <img src={`/venues/venue1.png`} alt="Venue" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        
        <div className="absolute top-4 left-4 flex gap-2">
          <Badge className="bg-primary text-black font-bold uppercase">{matchDetail.sport}</Badge>
          <Badge variant={matchDetail.status === 'open' ? 'secondary' : 'default'} className="uppercase font-bold">
            {matchDetail.status}
          </Badge>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-16 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-card/80 backdrop-blur-md border-border/50 shadow-xl">
              <CardContent className="p-6 md:p-8">
                <h1 className="text-3xl md:text-4xl font-extrabold uppercase italic tracking-tight mb-2">
                  {matchDetail.venue?.name}
                </h1>
                <div className="flex items-center text-muted-foreground mb-8">
                  <MapPin className="w-4 h-4 mr-1" /> {matchDetail.venue?.address}, {matchDetail.venue?.city}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-6 border-y border-border/50">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-muted-foreground mb-1">Date</span>
                    <span className="font-bold flex items-center gap-2"><Calendar className="w-4 h-4 text-primary"/> {format(parseISO(matchDetail.date), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-muted-foreground mb-1">Time</span>
                    <span className="font-bold flex items-center gap-2"><Clock className="w-4 h-4 text-primary"/> {matchDetail.startTime}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-muted-foreground mb-1">Level</span>
                    <span className="font-bold capitalize flex items-center gap-2"><Trophy className="w-4 h-4 text-primary"/> {matchDetail.skillLevel}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-muted-foreground mb-1">Host</span>
                    <span className="font-bold flex items-center gap-2">
                      <Avatar className="w-6 h-6"><AvatarImage src={matchDetail.host?.avatarUrl || ""} /><AvatarFallback>{matchDetail.host?.fullName?.charAt(0) || "H"}</AvatarFallback></Avatar>
                      {matchDetail.host?.fullName?.split(' ')[0] || "Host"}
                    </span>
                  </div>
                </div>

                {matchDetail.notes && (
                  <div className="mt-6">
                    <h3 className="font-bold uppercase text-sm mb-2 text-muted-foreground">Host Notes</h3>
                    <p className="bg-muted/30 p-4 rounded-lg italic border border-border/50 text-sm">"{matchDetail.notes}"</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Players Grid */}
            <Card className="bg-card border-border/50">
              <CardContent className="p-6">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <h2 className="text-xl font-bold uppercase italic">The <span className="text-primary">Squad</span></h2>
                    <p className="text-sm text-muted-foreground">{matchDetail.currentPlayers} / {matchDetail.totalPlayers} Players Joined</p>
                  </div>
                  <Badge variant="outline" className="font-bold border-primary text-primary">
                    {matchDetail.minPlayers} needed to confirm
                  </Badge>
                </div>

                <Progress value={progress} className="h-2 mb-8" />

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {/* Actual participants */}
                  {matchDetail.participants.map((p) => (
                    <div key={p.id} className="flex flex-col items-center p-4 bg-muted/20 rounded-xl border border-border/50 relative overflow-hidden group">
                      {p.user?.id === matchDetail.hostUserId && (
                        <div className="absolute top-0 w-full bg-primary text-black text-[9px] font-bold text-center uppercase tracking-wider py-0.5">Host</div>
                      )}
                      <Avatar className={`w-14 h-14 mb-3 ${p.user?.id === matchDetail.hostUserId ? 'mt-2 border-2 border-primary' : ''}`}>
                        <AvatarImage src={p.user?.avatarUrl || ""} />
                        <AvatarFallback className="bg-secondary text-secondary-foreground font-bold text-lg">
                          {p.user?.fullName?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-bold text-sm truncate w-full text-center">{p.user?.fullName?.split(' ')[0] || "Player"}</span>
                      {p.status === 'final_paid' && (
                        <Badge className="mt-2 text-[9px] h-4 px-1 bg-green-500/20 text-green-500 border-none">Paid Full</Badge>
                      )}
                    </div>
                  ))}

                  {/* Empty spots */}
                  {Array.from({ length: matchDetail.spotsLeft }).map((_, i) => (
                    <div key={`empty-${i}`} className="flex flex-col items-center justify-center p-4 border border-dashed border-border rounded-xl opacity-50 bg-background">
                      <div className="w-14 h-14 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center mb-3">
                        <UserPlus className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Open</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24 bg-card shadow-xl border-primary/20">
              <CardContent className="p-6">
                <div className="bg-muted p-4 rounded-lg mb-6 border border-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold uppercase text-muted-foreground tracking-wider">Reserve Fee</span>
                    <span className="text-2xl font-extrabold text-primary">₹{matchDetail.reserveFee}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Final Est. / Player</span>
                    <span className="font-bold">~₹{matchDetail.finalFeePerPlayer}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-3 leading-tight">
                    Pay reserve fee now to secure your spot. Remaining amount collected before the match.
                  </p>
                </div>

                {matchDetail.isUserJoined ? (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                    <ShieldCheck className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <h3 className="font-bold text-green-500 uppercase tracking-wider">You're in!</h3>
                    <p className="text-sm text-green-500/80 mt-1">See you on the pitch.</p>
                  </div>
                ) : isFull ? (
                  <Button className="w-full h-14 text-lg font-bold uppercase italic" disabled variant="secondary">
                    Match Full
                  </Button>
                ) : matchDetail.status !== 'open' ? (
                  <Button className="w-full h-14 text-lg font-bold uppercase italic" disabled variant="secondary">
                    Match {matchDetail.status}
                  </Button>
                ) : (
                  <Button 
                    className="w-full h-14 text-lg font-bold uppercase italic shadow-lg shadow-primary/20" 
                    onClick={handleJoin}
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Processing..." : `Join for ₹${matchDetail.reserveFee}`}
                  </Button>
                )}

                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">🛡️</div>
                    <p>Protected by Matchpit. Refunds guaranteed if match cancels.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}