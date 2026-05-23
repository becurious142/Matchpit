"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { CalendarDays, Clock, Users } from "lucide-react";

interface SlotSelectionProps {
  venueId: string;
  sport: string;
}

export function SlotSelection({ venueId, sport }: SlotSelectionProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isReserved, setIsReserved] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes

  // Mock available slots
  const availableSlots = [
    { id: "1", time: "18:00 - 19:00", price: 1200 },
    { id: "2", time: "19:00 - 20:00", price: 1500 },
    { id: "3", time: "20:00 - 21:00", price: 1500 },
  ];

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isReserved && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      // Auto-release logic
      setIsReserved(false);
      setSelectedSlot(null);
      setTimeLeft(300);
    }
    return () => clearInterval(timer);
  }, [isReserved, timeLeft]);

  const handleSelect = (id: string) => {
    setSelectedSlot(id);
  };

  const handleReserve = () => {
    if (!selectedSlot) return;
    setIsReserved(true);
    setTimeLeft(300); // start 5 min timer
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Select a Slot</CardTitle>
        <CardDescription>Book your {sport} session instantly</CardDescription>
      </CardHeader>
      <CardContent>
        {isReserved ? (
          <div className="space-y-4 text-center">
            <div className="rounded-md bg-muted p-4">
              <h3 className="text-lg font-semibold text-primary">Slot Reserved!</h3>
              <p className="text-sm text-muted-foreground mt-1">Complete payment to confirm</p>
              <div className="text-3xl font-mono mt-4 font-bold tracking-tight">
                {formatTime(timeLeft)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Slot will be released if not booked.
              </p>
            </div>
            {/* Payment recovery / retry UI could be conditionally rendered here if payment fails */}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {availableSlots.map((slot) => (
              <button
                key={slot.id}
                onClick={() => handleSelect(slot.id)}
                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                  selectedSlot === slot.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:border-foreground/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{slot.time}</span>
                </div>
                <span className="font-semibold text-primary">₹{slot.price}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter>
        {!isReserved ? (
          <Button 
            className="w-full" 
            disabled={!selectedSlot}
            onClick={handleReserve}
          >
            Reserve Slot
          </Button>
        ) : (
          <Button className="w-full bg-green-600 hover:bg-green-700">
            Proceed to Payment
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
