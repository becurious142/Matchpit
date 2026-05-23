import { Router, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/auth";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import crypto from "crypto";
import { logger } from "../lib/logger";

const router = Router();

// Configure S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT || "https://placeholder.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "mock-key",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "mock-secret",
  },
});

const uploadSchema = z.object({
  filename: z.string(),
  contentType: z.string().regex(/^(image\/jpeg|image\/png|image\/webp|application\/pdf)$/),
  type: z.enum(["venue_image", "avatar", "private_doc"]),
});

router.post("/presigned-url", requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    const { filename, contentType, type } = uploadSchema.parse(req.body);

    const ext = filename.split('.').pop();
    const uniqueId = crypto.randomUUID();
    const objectKey = `${type}/${userId}/${uniqueId}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || "matchpit-uploads",
      Key: objectKey,
      ContentType: contentType,
      // Metadata can trigger virus scan or processing queues via S3 event notifications
      Metadata: {
        userId: userId!,
        uploadType: type,
        status: "pending_scan"
      }
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

    res.json({
      uploadUrl: signedUrl,
      objectKey,
      publicUrl: `https://${process.env.CDN_DOMAIN}/${objectKey}` // May not be active until processed
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", details: err.errors });
    } else {
      logger.error({ err }, "Failed to generate presigned upload URL");
      res.status(500).json({ error: "internal_error" });
    }
  }
});

router.get("/delivery-url", requireAuth, async (req: Request, res: Response) => {
  try {
    const { objectKey } = req.query;
    if (!objectKey || typeof objectKey !== "string") {
      res.status(400).json({ error: "missing_object_key" });
      return;
    }

    // Only allow signed delivery for private docs
    if (!objectKey.startsWith("private_doc/")) {
      res.status(403).json({ error: "forbidden", message: "Use public CDN for public assets" });
      return;
    }

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || "matchpit-uploads",
      Key: objectKey,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    res.json({ url: signedUrl });
  } catch (err) {
    logger.error({ err }, "Failed to generate delivery URL");
    res.status(500).json({ error: "internal_error" });
  }
});

export const uploadsRouter = router;
