import { useListMyBookings, ListMyBookingsStatus } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function DashboardBookings() {
  const [status, setStatus] = useState<ListMyBookingsStatus | undefined>(undefined);
  const { data: bookings, isLoading } = useListMyBookings(
    { status },
    { query: { enabled: true } }
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl min-h-screen">
      <h1 className="text-3xl font-extrabold uppercase italic mb-8">My <span className="text-primary">Bookings</span></h1>

      <Tabs value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? undefined : v as ListMyBookingsStatus)} className="mb-8">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
        ) : bookings?.length ? (
          bookings.map(booking => (
            <Card key={booking.id} className="bg-card/50 border-border/50">
              <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant={
                      booking.status === 'confirmed' ? 'default' : 
                      booking.status === 'cancelled' ? 'destructive' : 'secondary'
                    } className="uppercase font-bold">
                      {booking.status}
                    </Badge>
                    <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{booking.sport}</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">{booking.venue?.name}</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2"><MapPin className="w-4 h-4"/> {booking.venue?.address}</div>
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4"/> {format(parseISO(booking.date), 'MMM d, yyyy')}</div>
                    <div className="flex items-center gap-2"><Clock className="w-4 h-4"/> {booking.startTime} - {booking.endTime}</div>
                  </div>
                </div>
                <div className="flex flex-col justify-end text-left sm:text-right">
                  <div className="text-xs uppercase font-bold text-muted-foreground tracking-wider mb-1">Amount Paid</div>
                  <div className="text-2xl font-extrabold text-primary">₹{booking.totalAmount}</div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground bg-card/30 rounded-xl border border-dashed">
            No bookings found.
          </div>
        )}
      </div>
    </div>
  );
}