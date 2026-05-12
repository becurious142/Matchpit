import { useParams, useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetHostedMatch, useJoinHostedMatch, useCreatePaymentOrder, useVerifyPayment, useGetMyProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, MapPin, Trophy, Users, ShieldCheck, UserPlus, Share2, Bell, RefreshCw, XCircle, IndianRupee, MessageCircle, Send } from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { loadRazorpay } from "@/lib/razorpay";
import { useUser } from "@clerk/react";
import { ShareModal } from "@/components/ShareModal";

async function matchFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error((await res.json()).message ?? "Request failed");
  return res.json();
}

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [rehosting, setRehosting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "chat">("info");
  const [chatMessage, setChatMessage] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const { data: matchDetail, isLoading, refetch } = useGetHostedMatch(id!);
  const { data: profile } = useGetMyProfile();
  const joinMatch = useJoinHostedMatch();
  const createPaymentOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();

  const { data: hostFinance } = useQuery<any>({
    queryKey: ["host-finance", id],
    queryFn: () => matchFetch(`/hosted-matches/${id}/finance`),
    enabled: !!matchDetail && !!profile && profile.id === matchDetail.hostUserId,
    retry: false,
  });

  const { data: chatMessages, refetch: refetchChat } = useQuery<any[]>({
    queryKey: ["match-chat", id],
    queryFn: () => matchFetch(`/hosted-matches/${id}/chat`),
    enabled: activeTab === "chat",
    refetchInterval: activeTab === "chat" ? 8000 : false,
  });

  const sendMessage = useMutation({
    mutationFn: (message: string) =>
      matchFetch(`/hosted-matches/${id}/chat`, { method: "POST", body: JSON.stringify({ message }) }),
    onSuccess: () => {
      setChatMessage("");
      refetchChat();
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (err: any) => toast({ title: err.message || "Failed to send", variant: "destructive" }),
  });

  const isHost = !!profile && !!matchDetail && profile.id === matchDetail.hostUserId;
  const currentUserParticipant = matchDetail?.participants.find(p => p.userId === profile?.id);
  const needsFinalPayment = currentUserParticipant && currentUserParticipant.status !== 'final_paid' && matchDetail?.status === 'confirmed';

  const handleJoin = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "You must be signed in to join a match." });
      return;
    }
    if (!matchDetail) return;

    setIsProcessing(true);
    try {
      const order = await createPaymentOrder.mutateAsync({
        data: { type: "match_reserve", referenceId: id!, amount: matchDetail.reserveFee }
      });

      const isLoaded = await loadRazorpay();
      if (!isLoaded) throw new Error("Razorpay SDK failed to load");

      const options = {
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "MATCHPIT",
        description: `Join Match: ${matchDetail.venue?.name}`,
        order_id: order.orderId,
        prefill: { name: order.prefillName || "", email: order.prefillEmail || "", contact: order.prefillContact || "" },
        theme: { color: "#84cc16" },
        handler: async function (response: any) {
          setIsProcessing(true);
          toast({ title: "Verifying payment...", description: "Please wait while we confirm your spot." });
          
          let attempts = 0;
          const pollInterval = setInterval(async () => {
            attempts++;
            const { data } = await refetch();
            const me = data?.participants?.find((p: any) => p.userId === user?.id);
            
            if (me?.paymentStatus === "reserve_paid") {
              clearInterval(pollInterval);
              setIsProcessing(false);
              toast({ title: "You're in!", description: "You've successfully joined the match." });
              queryClient.invalidateQueries({ queryKey: ["listHostedMatches"] });
            } else if (attempts >= 10) {
              clearInterval(pollInterval);
              // Fallback to manual verify if webhook is severely delayed
              try {
                await verifyPayment.mutateAsync({
                  data: {
                    razorpayOrderId: response.razorpay_order_id,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpaySignature: response.razorpay_signature,
                    type: "match_reserve",
                    referenceId: id!
                  }
                });
                await refetch();
                queryClient.invalidateQueries({ queryKey: ["listHostedMatches"] });
                toast({ title: "You're in!", description: "You've successfully joined the match." });
              } catch (err: any) {
                toast({ title: "Delayed processing", description: "Payment received, but taking longer than usual to confirm." });
              } finally {
                setIsProcessing(false);
              }
            }
          }, 2000);
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

  const handleFinalPayment = async () => {
    if (!user || !matchDetail) return;
    setIsProcessing(true);
    try {
      const order = await createPaymentOrder.mutateAsync({
        data: { type: "match_final", referenceId: id!, amount: matchDetail.finalFeePerPlayer }
      });

      const isLoaded = await loadRazorpay();
      if (!isLoaded) throw new Error("Razorpay SDK failed to load");

      const options = {
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "MATCHPIT",
        description: `Final Payment: ${matchDetail.venue?.name}`,
        order_id: order.orderId,
        prefill: { name: order.prefillName || "", email: order.prefillEmail || "", contact: order.prefillContact || "" },
        theme: { color: "#84cc16" },
        handler: async function (response: any) {
          setIsProcessing(true);
          toast({ title: "Verifying payment...", description: "Confirming your final payment." });

          let attempts = 0;
          const pollInterval = setInterval(async () => {
            attempts++;
            const { data } = await refetch();
            const me = data?.participants?.find((p: any) => p.userId === user?.id);
            
            if (me?.paymentStatus === "final_paid") {
              clearInterval(pollInterval);
              setIsProcessing(false);
              toast({ title: "Paid!", description: "You've successfully completed the final payment." });
              queryClient.invalidateQueries({ queryKey: ["listHostedMatches"] });
            } else if (attempts >= 10) {
              clearInterval(pollInterval);
              try {
                await verifyPayment.mutateAsync({
                  data: {
                    razorpayOrderId: response.razorpay_order_id,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpaySignature: response.razorpay_signature,
                    type: "match_final",
                    referenceId: id!,
                    computedGrossAmount: order.computedGrossAmount,
                    finalFeeComponent: order.finalFeeComponent
                  } as any
                });
                await refetch();
                toast({ title: "Paid!", description: "You've successfully completed the final payment." });
              } catch (err: any) {
                toast({ title: "Delayed processing", description: "Payment received, but taking longer than usual to confirm." });
              } finally {
                setIsProcessing(false);
              }
            }
          }, 2000);
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

  const handleNudge = async () => {
    setNudging(true);
    try {
      const result = await matchFetch<{ notified: number }>(`/hosted-matches/${id}/nudge-unpaid`, { method: "POST" });
      toast({ title: `Nudged ${result.notified} player${result.notified === 1 ? "" : "s"}`, description: "They've been notified to complete payment." });
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setNudging(false); }
  };

  const handleRehost = async () => {
    setRehosting(true);
    try {
      const result = await matchFetch<{ matchId: string }>(`/hosted-matches/${id}/rehost`, { method: "POST" });
      toast({ title: "New match created!", description: "Redirecting to your new match..." });
      setLocation(`/matches/${result.matchId}`);
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setRehosting(false); }
  };

  const handleCancelMatch = async () => {
    if (!confirm("Are you sure you want to cancel this match? All participants will be refunded.")) return;
    setCancelling(true);
    try {
      await matchFetch(`/hosted-matches/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Host cancelled the match" }) });
      toast({ title: "Match cancelled", description: "All participants have been notified." });
      refetch();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setCancelling(false); }
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
  const almostFull = progress >= 80;

  return (
    <div className="min-h-screen pb-20">
      {showShare && (
        <ShareModal
          matchId={id!}
          sport={matchDetail.sport}
          venueName={matchDetail.venue?.name ?? ""}
          date={matchDetail.date}
          spotsLeft={matchDetail.spotsLeft}
          reserveFee={matchDetail.reserveFee}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Hero */}
      <div className="relative h-[30vh] md:h-[40vh] w-full bg-muted">
        {matchDetail.venue?.coverImage ? (
          <img src={matchDetail.venue.coverImage} alt={matchDetail.venue.name} className="w-full h-full object-cover" />
        ) : (
          <img src="/venues/venue1.png" alt="Venue" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        <div className="absolute top-4 left-4 flex gap-2">
          <Badge className="bg-primary text-black font-bold uppercase">{matchDetail.sport}</Badge>
          <Badge variant={matchDetail.status === 'open' ? 'secondary' : 'default'} className="uppercase font-bold">
            {matchDetail.status}
          </Badge>
          {almostFull && <Badge className="bg-orange-500 text-white font-bold uppercase animate-pulse">Almost Full!</Badge>}
        </div>

        <button
          onClick={() => setShowShare(true)}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/50 backdrop-blur text-white hover:bg-black/70 transition-colors"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      <div className="container mx-auto px-4 -mt-16 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">

            {/* Tab Switcher */}
            <div className="flex gap-1 bg-muted rounded-xl p-1">
              <button
                onClick={() => setActiveTab("info")}
                className={`flex-1 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors ${
                  activeTab === "info" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Match Info
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex-1 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                  activeTab === "chat" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageCircle className="w-4 h-4" /> Discussion
              </button>
            </div>

            {/* Chat Tab */}
            {activeTab === "chat" && (
              <Card className="bg-card border-border/50">
                <CardContent className="p-0 flex flex-col" style={{ height: "min(480px, calc(100vh - 420px))", minHeight: "320px" }}>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {!chatMessages?.length ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <MessageCircle className="w-12 h-12 text-muted-foreground opacity-30 mb-3" />
                        <p className="font-bold text-muted-foreground">No messages yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {matchDetail.isUserJoined || isHost
                            ? "Be the first to say something!"
                            : "Join the match to participate in the chat."}
                        </p>
                      </div>
                    ) : (
                      chatMessages.map((msg: any) => {
                        const isMe = msg.userId === profile?.id;
                        return (
                          <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                            <Avatar className="w-8 h-8 shrink-0">
                              <AvatarImage src={msg.authorAvatar ?? undefined} />
                              <AvatarFallback className="text-xs bg-muted">{msg.authorName[0]}</AvatarFallback>
                            </Avatar>
                            <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                              {!isMe && <span className="text-[10px] text-muted-foreground font-bold mb-0.5 ml-1">{msg.authorName}</span>}
                              <div className={`rounded-2xl px-3 py-2 text-sm ${isMe ? "bg-primary text-black rounded-tr-sm" : "bg-muted rounded-tl-sm"}`}>
                                {msg.message}
                              </div>
                              <span className="text-[9px] text-muted-foreground mt-0.5 mx-1">
                                {formatDistanceToNow(parseISO(msg.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {(matchDetail.isUserJoined || isHost) ? (
                    <div className="border-t border-border/50 p-3 flex gap-2">
                      <input
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && chatMessage.trim()) {
                            e.preventDefault();
                            sendMessage.mutate(chatMessage.trim());
                          }
                        }}
                        placeholder="Type a message..."
                        className="flex-1 bg-muted rounded-full px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 border border-border/40"
                      />
                      <Button
                        size="icon"
                        className="rounded-full shrink-0"
                        disabled={!chatMessage.trim() || sendMessage.isPending}
                        onClick={() => chatMessage.trim() && sendMessage.mutate(chatMessage.trim())}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-t border-border/50 p-3 text-center text-xs text-muted-foreground">
                      Join this match to participate in the discussion.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Info Tab */}
            {activeTab === "info" && (
            <>
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
                    <span className="font-bold flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> {format(parseISO(matchDetail.date), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-muted-foreground mb-1">Time</span>
                    <span className="font-bold flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> {matchDetail.startTime}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-muted-foreground mb-1">Level</span>
                    <span className="font-bold capitalize flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> {matchDetail.skillLevel}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-muted-foreground mb-1">Host</span>
                    <span className="font-bold flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={matchDetail.host?.avatarUrl || ""} />
                        <AvatarFallback>{matchDetail.host?.fullName?.charAt(0) || "H"}</AvatarFallback>
                      </Avatar>
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
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-bold border-primary text-primary">
                      {matchDetail.minPlayers} needed to confirm
                    </Badge>
                    <button
                      onClick={() => setShowShare(true)}
                      className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                      <Share2 className="w-3 h-3" /> Invite
                    </button>
                  </div>
                </div>

                <Progress value={progress} className="h-2 mb-8" />

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {matchDetail.participants.map((p) => (
                    <div key={p.id} className="flex flex-col items-center p-4 bg-muted/20 rounded-xl border border-border/50 relative overflow-hidden">
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
                      {p.status === 'reserved' && (
                        <Badge className="mt-2 text-[9px] h-4 px-1 bg-yellow-500/20 text-yellow-500 border-none">Reserved</Badge>
                      )}
                    </div>
                  ))}
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

            {/* Host Control Center */}
            {isHost && (
              <Card className="bg-card border-2 border-primary/30">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold uppercase italic mb-1">Host <span className="text-primary">Control Center</span></h2>
                  <p className="text-sm text-muted-foreground mb-6">Manage your match as the host.</p>

                  {hostFinance && (
                    <div className="grid grid-cols-3 gap-3 mb-6 p-4 rounded-lg bg-muted/30 border border-border/50">
                      <div className="text-center">
                        <p className="text-xs uppercase font-bold text-muted-foreground mb-1">Reserve Collected</p>
                        <p className="text-xl font-extrabold text-primary">₹{hostFinance.reserveCollected ?? 0}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs uppercase font-bold text-muted-foreground mb-1">Final Collected</p>
                        <p className="text-xl font-extrabold">₹{hostFinance.finalCollected ?? 0}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs uppercase font-bold text-muted-foreground mb-1">Total Revenue</p>
                        <p className="text-xl font-extrabold text-green-500">₹{hostFinance.totalRevenue ?? 0}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Button
                      variant="outline"
                      className="h-12 font-bold border-primary/30 hover:bg-primary/5"
                      onClick={() => setShowShare(true)}
                    >
                      <Share2 className="w-4 h-4 mr-2" /> Share & Fill
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12 font-bold border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/5"
                      onClick={handleNudge}
                      disabled={nudging}
                    >
                      <Bell className="w-4 h-4 mr-2" /> {nudging ? "Nudging..." : "Nudge Unpaid"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12 font-bold border-blue-500/30 text-blue-500 hover:bg-blue-500/5"
                      onClick={handleRehost}
                      disabled={rehosting}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" /> {rehosting ? "Creating..." : "Rehost"}
                    </Button>
                    {matchDetail.status !== 'cancelled' && (
                      <Button
                        variant="outline"
                        className="h-12 font-bold border-destructive/30 text-destructive hover:bg-destructive/5 col-span-2 sm:col-span-1"
                        onClick={handleCancelMatch}
                        disabled={cancelling}
                      >
                        <XCircle className="w-4 h-4 mr-2" /> {cancelling ? "Cancelling..." : "Cancel Match"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            </>
            )}
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
                  needsFinalPayment ? (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-center">
                      <h3 className="font-bold text-yellow-500 uppercase tracking-wider mb-2">Final Payment Due</h3>
                      <p className="text-sm text-yellow-500/80 mb-4 leading-tight">Match confirmed! Pay your remaining balance to play.</p>
                      <Button
                        className="w-full h-12 text-md font-bold shadow-lg bg-yellow-500 hover:bg-yellow-600 text-black"
                        onClick={handleFinalPayment}
                        disabled={isProcessing}
                      >
                        {isProcessing ? "Processing..." : `Pay Final Amount ₹${matchDetail.finalFeePerPlayer}`}
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                      <ShieldCheck className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <h3 className="font-bold text-green-500 uppercase tracking-wider">You're in!</h3>
                      <p className="text-sm text-green-500/80 mt-1">See you on the pitch.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full border-green-500/30 text-green-500 hover:bg-green-500/10"
                        onClick={() => setShowShare(true)}
                      >
                        <Share2 className="w-3 h-3 mr-1" /> Invite Friends
                      </Button>
                    </div>
                  )
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
                  {!matchDetail.isUserJoined && matchDetail.status === 'open' && (
                    <button
                      onClick={() => setShowShare(true)}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors py-2 border border-dashed border-border/50 rounded-lg"
                    >
                      <Share2 className="w-3 h-3" /> Share this match
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
