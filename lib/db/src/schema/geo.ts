import { customType, pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";

export const geography = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
  toDriver(value: string) {
    return value;
  },
  fromDriver(value: string) {
    return value;
  },
});

export const userLocationsTable = pgTable(
  "user_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique(),
    coordinates: geography("coordinates").notNull(), 
    geohash: text("geohash"),
    metadata: jsonb("metadata").default({}),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);
