import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { adminOpsRouter } from "../src/routes/admin-ops";
import { testRegistry, seedUser, seedMatch, seedPayment } from "./setup";
import { db } from "@workspace/db";
import { adminAuditLogsTable, cronExecutionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Mock Clerk auth
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "test_clerk_id" }),
}));

// Mock our getProfileByClerkId to return an admin
vi.mock("../src/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth")>();
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: any) => next(),
    getProfileByClerkId: async () => ({
      id: "admin_user_id",
      clerkId: "test_clerk_id",
      isAdmin: true,
    }),
  };
});

const app = express();
app.use(express.json());
// Inject req.log to prevent Pino logger errors
app.use((req: any, res, next) => {
  req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  next();
});
app.use("/admin/ops", adminOpsRouter);

describe("Admin Ops APIs", () => {
  it("GET /admin/ops/overview returns operations metrics", async () => {
    const res = await request(app).get("/admin/ops/overview").expect(200);

    expect(res.body).toHaveProperty("dailyGmv");
    expect(res.body).toHaveProperty("pendingRefunds");
    expect(res.body).toHaveProperty("failedRefunds");
    expect(res.body).toHaveProperty("pendingPayoutsLiability");
    expect(res.body).toHaveProperty("timestamp");
  });

  it("GET /admin/ops/crons returns paginated cron executions", async () => {
    const [exec] = await db.insert(cronExecutionsTable).values({
      jobName: "test_job",
      jobKey: "test_cron",
      triggerSource: "system",
      status: "success",
      durationMs: 150,
      startedAt: new Date(),
      completedAt: new Date(),
    }).returning();
    
    // We don't have a registry for cron executions in setup.ts so we clean it manually
    try {
      const res = await request(app).get("/admin/ops/crons").expect(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.pagination).toHaveProperty("total");
      expect(res.body.data.some((c: any) => c.id === exec.id)).toBe(true);
    } finally {
      await db.delete(cronExecutionsTable).where(eq(cronExecutionsTable.id, exec.id));
    }
  });

  it("GET /admin/ops/audit-feed returns paginated audit logs", async () => {
    const admin = await seedUser({ isAdmin: true });

    // Insert an audit log
    const [log] = await db.insert(adminAuditLogsTable).values({
      adminId: admin.id,
      action: "test_action",
      targetType: "hosted_match",
      targetId: "00000000-0000-0000-0000-000000000123",
      changes: { old: "v1", new: "v2" },
      ipAddress: "127.0.0.1",
    }).returning();

    try {
      const res = await request(app).get("/admin/ops/audit-feed").expect(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.some((l: any) => l.id === log.id)).toBe(true);
      expect(res.body.pagination).toHaveProperty("total");
    } finally {
      await db.delete(adminAuditLogsTable).where(eq(adminAuditLogsTable.id, log.id));
    }
  });
});
