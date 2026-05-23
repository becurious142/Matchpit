import { z } from "zod";

// Base discovery query parameters
export const DiscoveryQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  sport: z.string().min(1),
  lastEventId: z.string().optional(),
});
export type DiscoveryQuery = z.infer<typeof DiscoveryQuerySchema>;

// Venue DTO
export const VenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  coordinates: z.tuple([z.number(), z.number()]),
  rating: z.number().optional(),
  imageUrl: z.string().optional(),
});
export type Venue = z.infer<typeof VenueSchema>;
