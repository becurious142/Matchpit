import { useGetAdminStats, useListAdminUsers, useGetMyProfile } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Redirect } from "wouter";

export default function Admin() {
  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const { data: stats, isLoading: statsLoading } = useGetAdminStats({ query: { enabled: !!profile?.isAdmin }});
  const { data: usersData, isLoading: usersLoading } = useListAdminUsers({}, { query: { enabled: !!profile?.isAdmin }});

  if (profileLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!profile?.isAdmin) return <Redirect to="/" />;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold uppercase italic mb-8 tracking-tighter text-primary">Admin Control</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : stats ? (
          <>
            <Card className="bg-card border-border"><CardContent className="p-6"><div className="text-3xl font-extrabold">{stats.totalRevenue}</div><div className="text-xs uppercase font-bold text-muted-foreground">Revenue</div></CardContent></Card>
            <Card className="bg-card border-border"><CardContent className="p-6"><div className="text-3xl font-extrabold">{stats.totalBookings}</div><div className="text-xs uppercase font-bold text-muted-foreground">Bookings</div></CardContent></Card>
            <Card className="bg-card border-border"><CardContent className="p-6"><div className="text-3xl font-extrabold">{stats.activeMatches}</div><div className="text-xs uppercase font-bold text-muted-foreground">Active Matches</div></CardContent></Card>
            <Card className="bg-card border-border"><CardContent className="p-6"><div className="text-3xl font-extrabold">{stats.totalUsers}</div><div className="text-xs uppercase font-bold text-muted-foreground">Users</div></CardContent></Card>
          </>
        ) : null}
      </div>

      <h2 className="text-xl font-bold uppercase italic mb-4">Recent Users</h2>
      <div className="rounded-md border border-border/50 overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ) : usersData?.users.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.fullName}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                <TableCell>{u.city || '-'}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}