"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function VenueOnboardingWizard() {
  const [step, setStep] = useState(1);

  const renderStepContent = () => {
    switch(step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Basic Details</h3>
            <p className="text-sm text-muted-foreground">Enter your venue name, location, and primary sports.</p>
            {/* Form fields simulated */}
            <div className="h-10 bg-muted rounded-md w-full animate-pulse"></div>
            <div className="h-10 bg-muted rounded-md w-full animate-pulse"></div>
            <div className="h-24 bg-muted rounded-md w-full animate-pulse"></div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Pricing & Slots</h3>
            <p className="text-sm text-muted-foreground">Define your pricing rules and operating hours.</p>
            <div className="h-32 bg-muted rounded-md w-full animate-pulse"></div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">KYC & Bank Setup</h3>
            <p className="text-sm text-muted-foreground">Add your GST details and payout account.</p>
            <div className="h-10 bg-muted rounded-md w-full animate-pulse"></div>
            <div className="h-10 bg-muted rounded-md w-full animate-pulse"></div>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <Card className="max-w-2xl mx-auto mt-10">
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <div className={`h-2 flex-1 rounded-l-full ${step >= 1 ? 'bg-primary' : 'bg-muted'}`}></div>
          <div className={`h-2 flex-1 mx-1 ${step >= 2 ? 'bg-primary' : 'bg-muted'}`}></div>
          <div className={`h-2 flex-1 rounded-r-full ${step >= 3 ? 'bg-primary' : 'bg-muted'}`}></div>
        </div>
        <CardTitle>Venue Onboarding</CardTitle>
        <CardDescription>Step {step} of 3</CardDescription>
      </CardHeader>
      <CardContent>
        {renderStepContent()}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
          Back
        </Button>
        <Button onClick={() => setStep(s => Math.min(3, s + 1))}>
          {step === 3 ? 'Submit for Review' : 'Next'}
        </Button>
      </CardFooter>
    </Card>
  );
}
