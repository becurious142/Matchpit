import { db, userLocationsTable, venuesTable, hostedMatchesTable } from "@workspace/db";
import { sql, eq, and, ne } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { decodeGeoCursor } from "../../lib/pagination/cursor";
import { DISCOVERY_RANKING } from "../../config/discovery-ranking";
import { DbRouting } from "../../lib/db-routing";

const MAX_RADIUS_METERS = 50000; // 50km hard cap

export class GeoRepository {
  /**
   * Upsert a user's location with TTL.
   * Ensures approximate coordinate storage (max 4 decimal places).
   */
  async upsertUserLocation(userId: string, latitude: number, longitude: number): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour TTL

    // Coordinate normalization to 4 decimals (~11m precision)
    const lat = Math.round(latitude * 10000) / 10000;
    const lng = Math.round(longitude * 10000) / 10000;

    await DbRouting.getPrimaryDb()
      .insert(userLocationsTable)
      .values({
        userId,
        coordinates: `SRID=4326;POINT(${lng} ${lat})`,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: userLocationsTable.userId,
        set: {
          coordinates: `SRID=4326;POINT(${lng} ${lat})`,
          expiresAt,
          updatedAt: new Date(),
        },
      });

    logger.debug({ userId, lat, lng }, "User location updated");
  }

  /**
   * Find nearby venues using PostGIS ST_DWithin and keyset pagination.
   */
  async findNearbyVenues(latitude: number, longitude: number, radiusMeters: number, cursorStr?: string, snapshotTsStr?: string) {
    const radius = Math.min(radiusMeters, MAX_RADIUS_METERS);
    const cursor = cursorStr ? decodeGeoCursor(cursorStr) : null;
    const limit = 50; // max page size
    const snapshotTs = cursor?.snapshotTs ?? snapshotTsStr ?? new Date().toISOString();

    const startTime = Date.now();
    const readDb = DbRouting.getReplicaDb();

    const query = sql`
      WITH BaseData AS (
        SELECT 
          v.id, 
          v.name, 
          v.city, 
          v.address,
          ST_Distance(v.coordinates, ST_GeographyFromText('SRID=4326;POINT(' || ${longitude} || ' ' || ${latitude} || ')')) as distance_meters,
          v.created_at,
          (
             ${DISCOVERY_RANKING.distanceWeight} / (ST_Distance(v.coordinates, ST_GeographyFromText('SRID=4326;POINT(' || ${longitude} || ' ' || ${latitude} || ')')) + 1)
             + (v.rating * ${DISCOVERY_RANKING.venueRatingWeight})
          ) as score
        FROM ${venuesTable} v
        WHERE ST_DWithin(
          v.coordinates, 
          ST_GeographyFromText('SRID=4326;POINT(' || ${longitude} || ' ' || ${latitude} || ')'), 
          ${radius}
        )
        AND v.is_approved = true
        AND v.created_at <= ${snapshotTs}::timestamp
        AND NOT EXISTS (
          SELECT 1 FROM fraud_flags f WHERE (f.target_id = v.id OR f.target_id = v.owner_user_id) AND f.status = 'open'
        )
      )
      SELECT * FROM BaseData
      ${cursor ? sql`
        WHERE (score < ${cursor.score})
           OR (score = ${cursor.score} AND distance_meters > ${cursor.distanceMeters})
           OR (score = ${cursor.score} AND distance_meters = ${cursor.distanceMeters} AND created_at < ${cursor.createdAt}::timestamp)
           OR (score = ${cursor.score} AND distance_meters = ${cursor.distanceMeters} AND created_at = ${cursor.createdAt}::timestamp AND id < ${cursor.id})
      ` : sql``}
      ORDER BY score DESC, distance_meters ASC, created_at DESC, id DESC
      LIMIT ${limit + 1}
    `;

    const results = await readDb.execute(query);

    const latency = Date.now() - startTime;
    if (latency > 250) {
      const explainQuery = sql`EXPLAIN ANALYZE ${query}`;
      const explainData = await readDb.execute(explainQuery);
      logger.warn({ latency, explainData: explainData.rows }, "Slow geo query for venues");
    }

    return { rows: results.rows, snapshotTs };
  }

  /**
   * Find nearby hosted matches using PostGIS ST_DWithin.
   */
  async findNearbyMatches(latitude: number, longitude: number, radiusMeters: number, cursorStr?: string, snapshotTsStr?: string) {
    const radius = Math.min(radiusMeters, MAX_RADIUS_METERS);
    const cursor = cursorStr ? decodeGeoCursor(cursorStr) : null;
    const limit = 50;
    const snapshotTs = cursor?.snapshotTs ?? snapshotTsStr ?? new Date().toISOString();

    const startTime = Date.now();
    const readDb = DbRouting.getReplicaDb();

    const query = sql`
      WITH BaseData AS (
        SELECT 
          m.id, 
          m.sport, 
          m.date, 
          m.start_time,
          m.created_at,
          ST_Distance(m.coordinates, ST_GeographyFromText('SRID=4326;POINT(' || ${longitude} || ' ' || ${latitude} || ')')) as distance_meters,
          (
            ${DISCOVERY_RANKING.distanceWeight} / (ST_Distance(m.coordinates, ST_GeographyFromText('SRID=4326;POINT(' || ${longitude} || ' ' || ${latitude} || ')')) + 1)
          ) as score
        FROM ${hostedMatchesTable} m
        WHERE m.status = 'open'
        AND m.created_at <= ${snapshotTs}::timestamp
        AND ST_DWithin(
          m.coordinates, 
          ST_GeographyFromText('SRID=4326;POINT(' || ${longitude} || ' ' || ${latitude} || ')'), 
          ${radius}
        )
        AND NOT EXISTS (
          SELECT 1 FROM fraud_flags f WHERE f.target_id = m.host_user_id AND f.status = 'open'
        )
        AND EXISTS (
          SELECT 1 FROM venues v WHERE v.id = m.venue_id AND v.is_approved = true
        )
      )
      SELECT * FROM BaseData
      ${cursor ? sql`
        WHERE (score < ${cursor.score})
           OR (score = ${cursor.score} AND distance_meters > ${cursor.distanceMeters})
           OR (score = ${cursor.score} AND distance_meters = ${cursor.distanceMeters} AND created_at < ${cursor.createdAt}::timestamp)
           OR (score = ${cursor.score} AND distance_meters = ${cursor.distanceMeters} AND created_at = ${cursor.createdAt}::timestamp AND id < ${cursor.id})
      ` : sql``}
      ORDER BY score DESC, distance_meters ASC, created_at DESC, id DESC
      LIMIT ${limit + 1}
    `;

    const results = await readDb.execute(query);

    const latency = Date.now() - startTime;
    if (latency > 250) {
      const explainQuery = sql`EXPLAIN ANALYZE ${query}`;
      const explainData = await readDb.execute(explainQuery);
      logger.warn({ latency, explainData: explainData.rows }, "Slow geo query for matches");
    }

    return { rows: results.rows, snapshotTs };
  }
}

export const geoRepository = new GeoRepository();
