import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { adminQueuesRouter } from "../../src/routes/admin-queues";
import * as clerkExpress from "@clerk/express";
import * as auth from "../../src/lib/auth";
import * as queues from "../../src/queues/queues";

// Mock auth
vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(),
}));

vi.mock("../../src/lib/auth", () => ({
  getProfileByClerkId: vi.fn(),
  requireAuth: vi.fn((req, res, next) => next()), // bypass middleware
}));

// Mock queues
vi.mock("../../src/queues/queues", () => ({
  ALL_QUEUE_NAMES: ["refunds", "notifications"],
  getQueueByName: vi.fn(),
}));

const app = express();
app.use(express.json());
// Add a mock logger middleware since routes use req.log
app.use((req: any, res, next) => {
  req.log = { error: vi.fn(), info: vi.fn() };
  next();
});
app.use(adminQueuesRouter);

describe("Phase 8C: Monitoring API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /admin/queues requires admin access", async () => {
    vi.mocked(clerkExpress.getAuth).mockReturnValue({ userId: "user123" } as any);
    vi.mocked(auth.getProfileByClerkId).mockResolvedValue({ isAdmin: false } as any);

    const response = await request(app).get("/admin/queues");
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("forbidden");
  });

  it("GET /admin/queues returns all queues stats", async () => {
    vi.mocked(clerkExpress.getAuth).mockReturnValue({ userId: "admin123" } as any);
    vi.mocked(auth.getProfileByClerkId).mockResolvedValue({ isAdmin: true } as any);

    const mockQueue = {
      getJobCounts: vi.fn().mockResolvedValue({ waiting: 1, active: 0, completed: 5, failed: 2, delayed: 0 }),
    };
    vi.mocked(queues.getQueueByName).mockReturnValue(mockQueue as any);

    const response = await request(app).get("/admin/queues");
    expect(response.status).toBe(200);
    expect(response.body.queues).toHaveLength(2);
    expect(response.body.queues[0].counts.failed).toBe(2);
  });

  it("GET /admin/queues/:name/jobs returns formatted and sanitized jobs", async () => {
    vi.mocked(clerkExpress.getAuth).mockReturnValue({ userId: "admin123" } as any);
    vi.mocked(auth.getProfileByClerkId).mockResolvedValue({ isAdmin: true } as any);

    const mockJob = {
      id: "1",
      name: "testJob",
      data: { secret: "12345", email: "test@example.com", publicData: "ok" },
      opts: {},
      progress: 0,
      attemptsMade: 1,
    };
    const mockQueue = {
      getJobs: vi.fn().mockResolvedValue([mockJob]),
    };
    vi.mocked(queues.getQueueByName).mockReturnValue(mockQueue as any);

    const response = await request(app).get("/admin/queues/refunds/jobs?status=failed");
    expect(response.status).toBe(200);
    
    const job = response.body.jobs[0];
    expect(job.id).toBe("1");
    // Verification of PII masking
    expect(job.data.secret).toBe("***MASKED***");
    expect(job.data.email).toBe("***MASKED***");
    expect(job.data.publicData).toBe("ok");
  });

  it("POST /admin/queues/:name/jobs/:id/retry triggers retry on job", async () => {
    vi.mocked(clerkExpress.getAuth).mockReturnValue({ userId: "admin123" } as any);
    vi.mocked(auth.getProfileByClerkId).mockResolvedValue({ isAdmin: true } as any);

    const mockJob = {
      id: "1",
      retry: vi.fn().mockResolvedValue(true),
    };
    const mockQueue = {
      getJob: vi.fn().mockResolvedValue(mockJob),
    };
    vi.mocked(queues.getQueueByName).mockReturnValue(mockQueue as any);

    const response = await request(app).post("/admin/queues/refunds/jobs/1/retry");
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mockJob.retry).toHaveBeenCalled();
  });

  it("DELETE /admin/queues/:name/jobs/:id removes a job", async () => {
    vi.mocked(clerkExpress.getAuth).mockReturnValue({ userId: "admin123" } as any);
    vi.mocked(auth.getProfileByClerkId).mockResolvedValue({ isAdmin: true } as any);

    const mockJob = {
      id: "2",
      remove: vi.fn().mockResolvedValue(true),
    };
    const mockQueue = {
      getJob: vi.fn().mockResolvedValue(mockJob),
    };
    vi.mocked(queues.getQueueByName).mockReturnValue(mockQueue as any);

    const response = await request(app).delete("/admin/queues/refunds/jobs/2");
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mockJob.remove).toHaveBeenCalled();
  });
});
