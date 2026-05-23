import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Generates a CSRF token and sets it as a SameSite=Strict HttpOnly cookie.
 * Also exposes a non-HttpOnly cookie for the frontend to read and send back in headers.
 */
export function setCsrfTokens(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.csrf_secret) {
    const secret = crypto.randomBytes(32).toString("hex");
    
    // The secret stays HTTP-only and is never readable by JS
    res.cookie("csrf_secret", secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Hash the secret to create a token the client CAN read
    const token = crypto.createHmac("sha256", process.env.CSRF_SIGNING_KEY || "default-key").update(secret).digest("hex");
    
    // The token is readable by JS
    res.cookie("XSRF-TOKEN", token, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
  next();
}

/**
 * Validates the CSRF token provided in headers against the HttpOnly secret cookie.
 */
export function validateCsrfToken(req: Request, res: Response, next: NextFunction) {
  // Allow safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Validate Origin header
  const origin = req.headers.origin || req.headers.referer;
  const allowedOrigin = process.env.FRONTEND_URL || "https://matchpit.in";
  
  if (!origin || !origin.startsWith(allowedOrigin)) {
    req.log.warn({ origin }, "CSRF Origin validation failed");
    return res.status(403).json({ error: "csrf_origin_mismatch" });
  }

  const secret = req.cookies?.csrf_secret;
  const headerToken = req.headers["x-xsrf-token"];

  if (!secret || !headerToken) {
    req.log.warn("CSRF tokens missing");
    return res.status(403).json({ error: "csrf_missing" });
  }

  const expectedToken = crypto.createHmac("sha256", process.env.CSRF_SIGNING_KEY || "default-key").update(secret).digest("hex");

  if (headerToken !== expectedToken) {
    req.log.warn("CSRF token mismatch");
    return res.status(403).json({ error: "csrf_invalid" });
  }

  next();
}
