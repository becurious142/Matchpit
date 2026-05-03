import { useGetWallet, useListPaymentHistory } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function DashboardWallet() {
  const { data: wallet, isLoading: loadingWallet } = useGetWallet();
  const { data: payments, isLoading: loadingPayments } = useListPaymentHistory();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl min-h-screen">
      <h1 className="text-3xl font-extrabold uppercase italic mb-8">My <span className="text-primary">Wallet</span></h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
        <Card className="bg-primary text-black border-primary">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2 opacity-80 font-bold uppercase tracking-wider text-xs">
              <CreditCard className="w-4 h-4" /> Current Balance
            </div>
            {loadingWallet ? <Skeleton className="h-10 w-24 bg-black/20" /> : <div className="text-4xl font-extrabold">₹{wallet?.balance}</div>}
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground font-bold uppercase tracking-wider text-xs">
              <ArrowDownRight className="w-4 h-4 text-green-500" /> Total Earned
            </div>
            {loadingWallet ? <Skeleton className="h-10 w-24" /> : <div className="text-3xl font-extrabold">₹{wallet?.totalEarned}</div>}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground font-bold uppercase tracking-wider text-xs">
              <ArrowUpRight className="w-4 h-4 text-destructive" /> Total Spent
            </div>
            {loadingWallet ? <Skeleton className="h-10 w-24" /> : <div className="text-3xl font-extrabold">₹{wallet?.totalSpent}</div>}
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-bold uppercase italic mb-4">Payment History</h2>
      
      <div className="rounded-md border border-border/50 overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingPayments ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ) : payments?.length ? (
              payments.map(payment => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{format(parseISO(payment.createdAt), 'MMM d, yyyy h:mm a')}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{payment.type.replace('_', ' ')}</TableCell>
                  <TableCell>
                    <Badge variant={payment.status === 'success' ? 'default' : payment.status === 'failed' ? 'destructive' : 'secondary'} className="uppercase font-bold text-[10px]">
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">₹{payment.amount}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">No payment history.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}