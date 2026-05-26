"use client";

import { useEffect, useCallback, useState } from "react";
import { useAppUIStore } from "@/store/uiStore";
import { useWalletStore } from "@/store/walletStore";
import { useCreatePaymentOrder, useVerifyPayment } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { X, Wallet, Zap, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

type CheckoutStep = "idle" | "creating_order" | "awaiting_payment" | "verifying" | "success" | "error";

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function GlobalCheckoutSheet() {
  const { isCheckoutOpen, checkoutConfig, closeCheckout } = useAppUIStore();
  const balance = useWalletStore((s) => s.balance);
  const setBalance = useWalletStore((s) => s.setBalance);

  const [step, setStep] = useState<CheckoutStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();

  // Reset step when sheet closes
  useEffect(() => {
    if (!isCheckoutOpen) {
      setStep("idle");
      setErrorMsg(null);
    }
  }, [isCheckoutOpen]);

  const handlePay = useCallback(async () => {
    if (!checkoutConfig) return;
    setStep("creating_order");
    setErrorMsg(null);

    try {
      // 1. Create Razorpay order via backend
      const order = await createOrder.mutateAsync({
        data: {
          amount: checkoutConfig.amount!,
          currency: checkoutConfig.currency ?? "INR",
          type: checkoutConfig.type ?? "reserve",
          ...(checkoutConfig.matchId ? { matchId: checkoutConfig.matchId } : {}),
          ...(checkoutConfig.venueId ? { venueId: checkoutConfig.venueId } : {}),
        },
      });

      // 2. Load Razorpay script
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Failed to load payment gateway.");

      setStep("awaiting_payment");

      // 3. Open Razorpay modal
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          order_id: order.razorpayOrderId,
          amount: order.amount,
          currency: order.currency ?? "INR",
          name: "Matchpit",
          description: checkoutConfig.type === "reserve" ? "Slot Reserve Fee" : "Full Booking",
          theme: { color: "#C8F135" },
          modal: {
            ondismiss: () => {
              setStep("idle");
              reject(new Error("Payment dismissed"));
            },
          },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            setStep("verifying");
            try {
              const result = await verifyPayment.mutateAsync({
                data: {
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpaySignature: response.razorpay_signature,
                },
              });
              // Update wallet balance optimistically
              if (result.newBalance !== undefined) {
                setBalance(result.newBalance);
              }
              setStep("success");
              resolve();
            } catch (err) {
              reject(err);
            }
          },
        });
        rzp.open();
      });
    } catch (err) {
      if ((err as Error).message !== "Payment dismissed") {
        setStep("error");
        setErrorMsg((err as Error).message ?? "Payment failed. Please try again.");
      }
    }
  }, [checkoutConfig, createOrder, verifyPayment, setBalance]);

  if (!isCheckoutOpen) return null;

  const amount = checkoutConfig?.amount ?? 0;
  const canPayWithWallet = balance >= amount;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={step === "idle" || step === "error" ? closeCheckout : undefined}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:top-1/2 md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:rounded-2xl w-full rounded-t-2xl bg-[#0B1020] border border-white/[0.08] shadow-2xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-0 duration-300">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 md:hidden">
          <div className="w-12 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-6 pt-4 pb-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">
              {checkoutConfig?.type === "wallet_topup" ? "Add Money" : "Confirm & Pay"}
            </h2>
            {(step === "idle" || step === "error") && (
              <button onClick={closeCheckout} className="text-muted-foreground hover:text-white transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Amount */}
          <div className="glass-card rounded-xl p-4 flex items-center justify-between">
            <span className="text-muted-foreground text-sm font-medium">Amount to Pay</span>
            <span className="text-2xl font-black text-gradient-lime pr-1">₹{amount}</span>
          </div>

          {/* Wallet balance info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="w-4 h-4 text-primary" />
            <span>Wallet Balance: <span className="text-white font-semibold">₹{balance}</span></span>
            {canPayWithWallet && (
              <span className="ml-auto text-primary text-xs font-semibold">Enough balance ✓</span>
            )}
          </div>

          {/* Trust badges */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-primary" />Secured by Razorpay</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" />Instant Confirmation</span>
          </div>

          {/* Step states */}
          {step === "success" && (
            <div className="rounded-xl bg-primary/10 border border-primary/30 p-4 text-center">
              <p className="text-primary font-bold text-lg">🎉 Payment Confirmed!</p>
              <p className="text-muted-foreground text-sm mt-1">Your slot has been reserved.</p>
              <Button className="mt-4 w-full" onClick={closeCheckout}>Done</Button>
            </div>
          )}

          {step === "error" && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4">
              <p className="text-destructive font-semibold text-sm">{errorMsg ?? "An error occurred."}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setStep("idle")}>
                Try Again
              </Button>
            </div>
          )}

          {(step === "creating_order" || step === "verifying") && (
            <div className="flex items-center justify-center gap-3 py-4 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm font-medium">
                {step === "creating_order" ? "Creating secure order…" : "Verifying payment…"}
              </span>
            </div>
          )}

          {step === "idle" && (
            <Button
              id="checkout-pay-btn"
              className={cn(
                "w-full h-12 font-bold uppercase tracking-wider text-sm",
                "bg-primary text-primary-foreground hover:bg-primary/90 neon-glow"
              )}
              onClick={handlePay}
              disabled={createOrder.isPending || verifyPayment.isPending}
            >
              Pay ₹{amount} with Razorpay
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
