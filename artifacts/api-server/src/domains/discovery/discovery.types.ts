import { z } from "zod";

export const discoveryQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(50).default(5),
  sport: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

export interface DiscoveryCursor {
  score: number;
  distanceMeters: number;
  createdAt: string;
  id: string;
  snapshotTs: string;
}
