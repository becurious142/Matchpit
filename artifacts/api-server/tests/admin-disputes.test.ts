import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
import { adminDisputesRouter } from "../src/routes/admin-disputes";
import { testRegistry, buildMatchScenario, seedUser, seedParticipant } from "./setup";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hostedMatchesTable, hostedMatchParticipantsTable, profilesTable, adminAuditLogsTable } from "@workspace/db";

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
      id: "00000000-0000-0000-0000-000000000001",
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
app.use("/admin/disputes", adminDisputesRouter);

describe("Admin Disputes APIs", () => {
  beforeAll(async () => {
    await db.delete(adminAuditLogsTable).where(eq(adminAuditLogsTable.adminId, "00000000-0000-0000-0000-000000000001"));
    await db.delete(profilesTable).where(eq(profilesTable.id, "00000000-0000-0000-0000-000000000001"));
    await db.insert(profilesTable).values({
      id: "00000000-0000-0000-0000-000000000001",
      clerkId: "test_clerk_id",
      email: "admin@test.com",
      fullName: "Admin",
      isAdmin: true,
    });
  });

  afterAll(async () => {
    await db.delete(adminAuditLogsTable).where(eq(adminAuditLogsTable.adminId, "00000000-0000-0000-0000-000000000001"));
    await db.delete(profilesTable).where(eq(profilesTable.id, "00000000-0000-0000-0000-000000000001"));
  });

  it("GET /admin/disputes/ returns paginated disputes", async () => {
    // Create a disputed match
    const { match } = await buildMatchScenario({ numPlayers: 4, minPlayers: 2 });
    
    await db.update(hostedMatchesTable)
      .set({ status: "disputed" })
      .where(eq(hostedMatchesTable.id, match.id));

    const res = await request(app).get("/admin/disputes/").expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.some((d: any) => d.id === match.id)).toBe(true);
    expect(res.body.pagination).toHaveProperty("total");
  });

  it("POST /admin/disputes/:id/resolve fails if resolution strategy is invalid", async () => {
    const { match } = await buildMatchScenario();
    
    await db.update(hostedMatchesTable)
      .set({ status: "disputed" })
      .where(eq(hostedMatchesTable.id, match.id));

    const res = await request(app)
      .post(`/admin/disputes/${match.id}/resolve`)
      .send({ action: "invalid_strategy", resolutionNotes: "bad" })
      .expect(400);

    expect(res.body.error).toContain("Invalid action");
  });

  it("POST /admin/disputes/:id/resolve handles force_complete properly", async () => {
    const { match } = await buildMatchScenario();
    
    await db.update(hostedMatchesTable)
      .set({ status: "disputed" })
      .where(eq(hostedMatchesTable.id, match.id));

    // Resolve as force complete
    const res = await request(app)
      .post(`/admin/disputes/${match.id}/resolve`)
      .send({ action: "complete", resolutionNotes: "all good" })
      .expect(200);

    expect(res.body.success).toBe(true);

    // Verify DB state
    const [updated] = await db.select().from(hostedMatchesTable).where(eq(hostedMatchesTable.id, match.id));
    expect(updated.status).toBe("completed");
  });
});
