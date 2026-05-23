import { Suspense } from "react";
import { MapView } from "@/components/discovery/map-view";
import { Skeleton } from "@/components/ui/skeleton";
import { Venue } from "@workspace/contracts";

// Simulated fetch function
async function getVenuesInBounds(bounds?: string): Promise<Venue[]> {
  // Replace with actual API call
  return [
    {
      id: "1",
      name: "Kickoff Arena",
      address: "Malviya Nagar",
      coordinates: [26.85, 75.81],
    },
    {
      id: "2",
      name: "Sporty Beans Turf",
      address: "Vaishali Nagar",
      coordinates: [26.91, 75.73],
    }
  ];
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  const bounds = typeof resolvedParams.bounds === "string" ? resolvedParams.bounds : undefined;
  
  const venues = await getVenuesInBounds(bounds);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col md:flex-row overflow-hidden">
      {/* Left List View */}
      <div className="w-full md:w-[400px] lg:w-[500px] border-r bg-background flex flex-col h-[50vh] md:h-full z-10 overflow-hidden shadow-lg">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">Discover Venues</h1>
          <p className="text-sm text-muted-foreground">Find sports venues near you</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Suspense fallback={<VenueListSkeleton />}>
            {venues.map(v => (
              <div key={v.id} className="p-4 rounded-lg border bg-card hover:border-primary cursor-pointer transition-colors">
                <h3 className="font-semibold">{v.name}</h3>
                <p className="text-sm text-muted-foreground">{v.address}</p>
                <div className="mt-2 text-xs bg-muted inline-block px-2 py-1 rounded">2 slots available</div>
              </div>
            ))}
          </Suspense>
        </div>
      </div>

      {/* Right Map View */}
      <div className="flex-1 relative bg-muted h-[50vh] md:h-full">
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted flex items-center justify-center">Loading Map...</div>}>
          <MapView venues={venues} />
        </Suspense>
      </div>
    </div>
  );
}

function VenueListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}
