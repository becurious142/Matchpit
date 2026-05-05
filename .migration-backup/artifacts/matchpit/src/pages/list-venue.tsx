import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSubmitOwnerLead } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

const leadSchema = z.object({
  venueName: z.string().min(2, "Venue name is required"),
  ownerName: z.string().min(2, "Your name is required"),
  phone: z.string().min(10, "Valid phone required"),
  city: z.string().min(2, "City is required"),
  sports: z.string().min(2, "List sports offered"),
  message: z.string().optional()
});

export default function ListVenue() {
  const submitLead = useSubmitOwnerLead();
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);

  const form = useForm<z.infer<typeof leadSchema>>({
    resolver: zodResolver(leadSchema),
    defaultValues: { venueName: "", ownerName: "", phone: "", city: "", sports: "", message: "" }
  });

  const onSubmit = async (values: z.infer<typeof leadSchema>) => {
    try {
      await submitLead.mutateAsync({
        data: {
          ...values,
          sports: values.sports.split(',').map(s => s.trim())
        }
      });
      setSuccess(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (success) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 text-center">
        <CheckCircle2 className="w-24 h-24 text-primary mb-6" />
        <h1 className="text-4xl font-extrabold uppercase italic mb-4">Request <span className="text-primary">Sent</span></h1>
        <p className="text-muted-foreground text-lg max-w-md">
          Thanks for reaching out! Our team will contact you within 24 hours to onboard your venue.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-4">List Your <span className="text-primary">Turf</span></h1>
        <p className="text-muted-foreground">Maximize occupancy. Get guaranteed payouts. Let MATCHPIT handle the bookings while you focus on the pitch.</p>
      </div>

      <Card className="bg-card/50 border-primary/20 backdrop-blur-sm">
        <CardContent className="p-6 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField control={form.control} name="venueName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider">Venue Name</FormLabel>
                  <FormControl><Input {...field} className="h-12 bg-background" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="ownerName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Your Name</FormLabel>
                    <FormControl><Input {...field} className="h-12 bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Phone Number</FormLabel>
                    <FormControl><Input {...field} className="h-12 bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">City</FormLabel>
                    <FormControl><Input {...field} className="h-12 bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="sports" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider">Sports Offered (comma separated)</FormLabel>
                    <FormControl><Input {...field} placeholder="Football, Cricket..." className="h-12 bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="message" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider">Additional Message (Optional)</FormLabel>
                  <FormControl><Textarea {...field} className="resize-none h-24 bg-background" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" className="w-full h-14 text-lg font-bold uppercase italic" disabled={submitLead.isPending}>
                {submitLead.isPending ? "Sending..." : "Request Call Back"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}