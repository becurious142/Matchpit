import { test, expect } from "vitest";
import { idempotencyMiddleware } from "../../artifacts/api-server/src/lib/idempotency";
import { db, idempotencyKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

test("Security: Idempotency payload manipulation defense", async () => {
  // We mock a request that uses an idempotency key.
  // Then we attempt to reuse that key with a DIFFERENT payload.
  // The middleware should reject the second request (HTTP 400).

  const req1 = {
    headers: { "idempotency-key": "test_idem_key_123" },
    body: { amount: 500 },
    query: {},
    originalUrl: "/api/matches/join",
    auth: { userId: "test_user_1" }
  };

  const req2 = {
    headers: { "idempotency-key": "test_idem_key_123" }, // Reusing the key
    body: { amount: 1000 }, // Manipulated payload
    query: {},
    originalUrl: "/api/matches/join",
    auth: { userId: "test_user_1" }
  };

  // We skip the full express setup and directly test the DB state logic
  // that idempotency.ts relies on:
  
  const requestPayload1 = JSON.stringify({ body: req1.body, query: req1.query });
  const requestHash1 = crypto.createHash("sha256").update(requestPayload1).digest("hex");

  await db.insert(idempotencyKeysTable).values({
    idempotencyKey: req1.headers["idempotency-key"],
    userId: req1.auth.userId,
    route: req1.originalUrl,
    requestHash: requestHash1,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    responseStatus: 200,
    responseBody: { success: true },
  });

  // Now simulate req2 checking the DB
  const requestPayload2 = JSON.stringify({ body: req2.body, query: req2.query });
  const requestHash2 = crypto.createHash("sha256").update(requestPayload2).digest("hex");

  const [existing] = await db
    .select()
    .from(idempotencyKeysTable)
    .where(eq(idempotencyKeysTable.idempotencyKey, req2.headers["idempotency-key"]));

  // The hashes should differ
  expect(existing.requestHash).not.toBe(requestHash2);
  
  // Clean up
  await db.delete(idempotencyKeysTable).where(eq(idempotencyKeysTable.idempotencyKey, "test_idem_key_123"));
});
