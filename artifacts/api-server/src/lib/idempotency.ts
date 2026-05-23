import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { idempotencyKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { getAuth } from "@clerk/express";
import { logger } from "./logger";

export const idempotencyMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers["idempotency-key"] as string;

    if (!idempotencyKey) {
      return next(); // No key, proceed normally
    }

    try {
      const { userId } = getAuth(req);
      if (!userId) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }

      // Compute request hash (body + query)
      const requestPayload = JSON.stringify({ body: req.body, query: req.query });
      const requestHash = crypto.createHash("sha256").update(requestPayload).digest("hex");

      const [existing] = await db
        .select()
        .from(idempotencyKeysTable)
        .where(eq(idempotencyKeysTable.idempotencyKey, idempotencyKey));

      if (existing) {
        // Validate user matches
        if (existing.userId !== userId) {
          res.status(403).json({ error: "idempotency_key_mismatch", message: "Idempotency key belongs to another user" });
          return;
        }

        // Validate payload hash matches
        if (existing.requestHash !== requestHash) {
          res.status(400).json({ error: "idempotency_payload_mismatch", message: "Payload differs for same idempotency key" });
          return;
        }

        // If response is already computed, replay it
        if (existing.responseStatus) {
          logger.info({ idempotencyKey, route: req.originalUrl }, "Replaying idempotent response");
          res.status(existing.responseStatus).json(existing.responseBody);
          return;
        } else {
          // It's currently processing (race condition)
          res.status(409).json({ error: "concurrent_request", message: "A request with this idempotency key is currently processing" });
          return;
        }
      }

      // Insert "in-progress" record
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24hr TTL
      await db.insert(idempotencyKeysTable).values({
        idempotencyKey,
        userId,
        route: req.originalUrl,
        requestHash,
        expiresAt,
      });

      // Hook into response object to capture the response body
      const originalSend = res.send;
      let responseBody: any;

      res.send = function (body: any) {
        responseBody = body;
        return originalSend.call(this, body);
      };

      res.on("finish", async () => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          // Try to parse body if it's JSON
          let parsedBody = responseBody;
          try {
            if (typeof responseBody === "string") {
              parsedBody = JSON.parse(responseBody);
            }
          } catch {}

          await db
            .update(idempotencyKeysTable)
            .set({
              responseStatus: res.statusCode,
              responseBody: parsedBody,
            })
            .where(eq(idempotencyKeysTable.idempotencyKey, idempotencyKey))
            .catch(err => {
              logger.error({ err, idempotencyKey }, "Failed to save idempotent response");
            });
        } else {
          // If 5xx, delete the key so client can retry safely
          await db
            .delete(idempotencyKeysTable)
            .where(eq(idempotencyKeysTable.idempotencyKey, idempotencyKey))
            .catch(err => logger.error({ err }, "Failed to clear failed idempotent key"));
        }
      });

      next();
    } catch (err) {
      logger.error({ err }, "Idempotency middleware error");
      res.status(500).json({ error: "internal_error" });
    }
  };
};
