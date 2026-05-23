export interface GeoCursor {
  score: number;
  distanceMeters: number;
  createdAt: string; // ISO date
  id: string;
  snapshotTs: string;
}

export function encodeGeoCursor(cursor: GeoCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeGeoCursor(encoded: string): GeoCursor | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf-8");
    return JSON.parse(json) as GeoCursor;
  } catch {
    return null;
  }
}
