import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { getProfileByClerkId } from "../lib/auth";

export function requireRole(allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = getAuth(req);
      if (!userId) {
        res.status(401).json({ error: "unauthorized", message: "Not authenticated" });
        return;
      }

      const profile = await getProfileByClerkId(userId);
      if (!profile) {
        res.status(401).json({ error: "unauthorized", message: "Profile not found" });
        return;
      }

      // If user is admin, they are allowed for both "admin" and "superadmin" checks
      // In a real RBAC system you would have a roles array, but for now isAdmin is the flag
      if (allowedRoles.includes("admin") || allowedRoles.includes("superadmin")) {
        if (!profile.isAdmin) {
          res.status(403).json({ error: "forbidden", message: "Admin access required" });
          return;
        }
      }

      next();
    } catch (err) {
      req.log.error({ err }, "Error in requireRole middleware");
      res.status(500).json({ error: "internal_error", message: "Auth check failed" });
    }
  };
}
