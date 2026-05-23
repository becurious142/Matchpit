import helmet from "helmet";
import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";

/**
 * Helmet configuration for standard security headers
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://matchpit.in", "https://checkout.razorpay.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://matchpit.in", "https://images.clerk.dev"],
      connectSrc: ["'self'", "https://api.razorpay.com"],
      frameSrc: ["https://checkout.razorpay.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

/**
 * Validates that requests come from a trusted proxy (e.g. Cloudflare or Vercel).
 * Helps prevent IP spoofing in headers like X-Forwarded-For.
 */
export const trustedProxyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // express 'trust proxy' setting handles IP extraction natively.
  // Here we can enforce additional checks if needed (e.g., specific CDN headers).
  const expectedCdnHeader = process.env.EXPECTED_CDN_HEADER;
  if (expectedCdnHeader && req.headers["x-cdn-verification"] !== expectedCdnHeader) {
    req.log.warn({ ip: req.ip }, "Direct access blocked (bypassed proxy)");
    res.status(403).json({ error: "forbidden", message: "Direct access to backend is forbidden" });
    return;
  }
  next();
};

/**
 * Detects IP drift during an active session (Basic implementation).
 * If the IP changes drastically during a session, it could indicate cookie theft.
 * Note: Users on mobile networks often change IPs, so this should be lenient (e.g., check ASN or country)
 * or only apply to sensitive actions (like withdrawals).
 */
export const sessionIpDriftDetection = (req: Request, res: Response, next: NextFunction) => {
  const { userId, sessionId } = getAuth(req);
  const currentIp = req.ip;

  if (!userId || !sessionId || !currentIp) {
    return next();
  }

  // Ideally, we fetch the IP used to establish the session from a Redis cache or DB.
  // For now, we log the IP to telemetry/auth logs. A production implementation 
  // would compare currentIp with the cached IP and flag if different.
  req.log.trace({ userId, sessionId, currentIp }, "Session IP tracking");
  
  // Future: Check against redis: `session_ip:${sessionId}`
  // if (cachedIp && cachedIp !== currentIp) {
  //   req.log.warn("Session IP drift detected");
  //   // Return 401 or require re-authentication
  // }

  next();
};

/**
 * Basic CSRF protection for mutations
 * Assumes the client sends a custom header (e.g. x-csrf-token) that matches a cookie.
 * (If using Clerk, Clerk handles its own CSRF for the session token).
 * For API-only servers, relying on Authorization headers is usually sufficient.
 */
export const requireCsrfHeader = (req: Request, res: Response, next: NextFunction) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    // If not using an Authorization header (e.g., using cookies), require CSRF token
    if (!req.headers.authorization && !req.headers["x-matchpit-csrf"]) {
      res.status(403).json({ error: "csrf_missing", message: "CSRF token missing" });
      return;
    }
  }
  next();
};
