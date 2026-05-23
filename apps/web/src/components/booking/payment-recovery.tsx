"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { AlertCircle, RefreshCw } from "lucide-react";

export function PaymentRecovery() {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = () => {
    setIsRetrying(true);
    // Simulate Razorpay retry
    setTimeout(() => {
      setIsRetrying(false);
    }, 2000);
  };

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <CardTitle className="text-lg">Payment Failed</CardTitle>
        </div>
        <CardDescription>
          Your slot is still reserved for 3:42. Please try your payment again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Error: Bank server timeout. No amount was deducted.
        </p>
        <Button 
          className="w-full" 
          variant="default"
          onClick={handleRetry}
          disabled={isRetrying}
        >
          {isRetrying ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Resume Booking
        </Button>
      </CardContent>
    </Card>
  );
}
