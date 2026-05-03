import { useGetDashboard, useGetRecentActivity, usePayMatchFinalAmount, useCreatePaymentOrder, useVerifyPayment } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { Calendar, CreditCard, Trophy, Target, Clock, ArrowRight, ShieldAlert } from "lucide-react";
import { format, parseISO } from "date-fns";
import { loadRazorpay } from "@/lib/razorpay";
import { useState } from "react";

export default function Dashboard() {
  const { data: dashboard, isLoading: loadingDash, refetch } = useGetDashboard();
  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const createPaymentOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();
  const payFinalAmount = usePayMatchFinalAmount();

  const handleFinalPayment = async (matchId: string, amount: number) => {
    setProcessingId(matchId);
    try {
      const tempRefId = `final_${matchId}`;
      const order = await createPaymentOrder.mutateAsync({
        data: {
          type: "match_final",
          referenceId: tempRefId,
          amount: amount
        }
      });

      const isLoaded = await loadRazorpay();
      if (!isLoaded) throw new Error("Razorpay SDK failed to load");

      const options = {
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "MATCHPIT",
        description: `Final Match Payment`,
        order_id: order.orderId,
        theme: { color: "#84cc16" },
        handler: async function (response: any) {
          try {
            await verifyPayment.mutateAsync({
              data: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                type: "match_final",
                referenceId: tempRefId
              }
            });

            await payFinalAmount.mutateAsync({
              matchId,
              data: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature
              }
            });

            toast({ title: "Payment Successful! 💸", description: "You're all set for the match." });
            refetch();
          } catch (err: any) {
            toast({ title: "Failed", description: err.message, variant: "destructive" });
          } finally {
            setProcessingId(null);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', () => setProcessingId(null));
      rzp.open();
    } catch (err: any) {
      setProcessingId(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (loadingDash) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-extrabold uppercase italic mb-8">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl min-h-screen">
      <div className="flex justify-between items-end mb-8">
        <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter">Your <span className="text-primary">Locker Room</span></h1>
        <Link href="/profile">
          <Button variant="outline" className="font-bold uppercase text-xs">Edit Profile</Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <Calendar className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-extrabold">{dashboard?.upcomingBookingsCount || 0}</div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Bookings</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <Trophy className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-extrabold">{dashboard?.totalMatchesJoined || 0}</div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Matches Joined</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <Target className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-extrabold">{dashboard?.totalMatchesHosted || 0}</div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Matches Hosted</div>
          </CardContent>
        </Card>
        <Card className="bg-primary border-primary text-black">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <CreditCard className="w-5 h-5 mb-2 opacity-80" />
            <div className="text-2xl font-extrabold">₹{dashboard?.walletBalance || 0}</div>
            <div className="text-[10px] uppercase font-bold tracking-wider opacity-80">Wallet Balance</div>
          </CardContent>
        </Card>
      </div>

      {dashboard?.pendingFinalPaymentsCount && dashboard.pendingFinalPaymentsCount > 0 ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-destructive" />
            <div>
              <h4 className="font-bold text-destructive">Action Required</h4>
              <p className="text-sm text-destructive/80">You have {dashboard.pendingFinalPaymentsCount} pending final payment(s) for upcoming matches.</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="grid grid-cols-2 w-[400px] max-w-full">
              <TabsTrigger value="upcoming" className="uppercase font-bold">Upcoming Action</TabsTrigger>
              <TabsTrigger value="badges" className="uppercase font-bold">Badges</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upcoming" className="mt-6 space-y-6">
              {/* Confirmed Matches requiring payment or just upcoming */}
              {dashboard?.confirmedMatches.map(match => (
                <Card key={match.id} className="bg-card border-border/50 overflow-hidden">
                  <div className="bg-muted px-4 py-2 border-b border-border/50 flex justify-between items-center">
                    <Badge variant="outline" className="font-bold uppercase tracking-wider text-[10px] border-primary text-primary">Hosted Match</Badge>
                    <span className="text-xs font-bold text-muted-foreground">{format(parseISO(match.date), 'MMM d')} • {match.startTime}</span>
                  </div>
                  <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                        <Trophy className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg leading-tight mb-1">{match.venue?.name}</h4>
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{match.sport}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:items-end w-full sm:w-auto gap-2">
                      <Button size="sm" onClick={() => setLocation(`/matches/${match.id}`)} variant="outline" className="w-full sm:w-auto font-bold uppercase italic">
                        View Lobby
                      </Button>
                      {/* Note: logic to show final payment button depends on participant status, simplified here */}
                      <Button 
                        size="sm" 
                        onClick={() => handleFinalPayment(match.id, match.finalFeePerPlayer)}
                        disabled={processingId === match.id}
                        className="w-full sm:w-auto font-bold uppercase"
                      >
                        {processingId === match.id ? "Processing..." : `Pay Final ₹${matchDetail?.finalFeePerPlayer || match.finalFeePerPlayer}`}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Private Bookings */}
              {dashboard?.upcomingBookings.map(booking => (
                <Card key={booking.id} className="bg-card border-border/50 overflow-hidden">
                  <div className="bg-muted px-4 py-2 border-b border-border/50 flex justify-between items-center">
                    <Badge variant="outline" className="font-bold uppercase tracking-wider text-[10px]">Private Booking</Badge>
                    <span className="text-xs font-bold text-muted-foreground">{format(parseISO(booking.date), 'MMM d')} • {booking.startTime}</span>
                  </div>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center shrink-0">
                        <Calendar className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg leading-tight mb-1">{booking.venue?.name}</h4>
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{booking.sport}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setLocation(`/venues/${booking.venueId}`)}>
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}

              {(!dashboard?.confirmedMatches?.length && !dashboard?.upcomingBookings?.length) && (
                <div className="text-center py-12 border border-dashed border-border rounded-xl">
                  <p className="text-muted-foreground mb-4">No upcoming action.</p>
                  <div className="flex justify-center gap-4">
                    <Link href="/venues"><Button variant="outline" className="uppercase font-bold text-xs">Book Turf</Button></Link>
                    <Link href="/matches"><Button className="uppercase font-bold text-xs">Join Match</Button></Link>
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="badges" className="mt-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {dashboard?.badges.map(badge => (
                  <div key={badge.id} className="bg-card border border-border/50 rounded-xl p-4 flex flex-col items-center text-center">
                    <span className="text-4xl mb-2">{badge.icon}</span>
                    <span className="font-bold text-sm mb-1 leading-tight">{badge.label}</span>
                    <span className="text-[10px] text-muted-foreground">{format(parseISO(badge.earnedAt), 'MMM yyyy')}</span>
                  </div>
                ))}
                {(!dashboard?.badges || dashboard.badges.length === 0) && (
                  <div className="col-span-full text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                    Host or join matches to earn badges.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-1">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Activity Feed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {loadingActivity ? (
                  Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                ) : activity?.map((item, i) => (
                  <div key={item.id} className="flex gap-4 relative">
                    {i !== activity.length - 1 && (
                      <div className="absolute left-[11px] top-6 w-[2px] h-full bg-border" />
                    )}
                    <div className="w-6 h-6 rounded-full bg-secondary border-2 border-background flex items-center justify-center shrink-0 mt-0.5 z-10">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-wider">{format(parseISO(item.createdAt), 'MMM d, h:mm a')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}