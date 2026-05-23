import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@workspace/db";
import { fraudFlagsTable } from "@workspace/db";
import { processRiskEvaluation } from "../src/queues/workers/risk-evaluation.worker";
import { RISK_THRESHOLDS } from "../src/lib/risk-rule-config";

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      schema: actual,
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      transaction: vi.fn().mockImplementation(async (cb) => {
        const tx = {
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
        };
        return cb(tx);
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      eq: actual.eq,
      and: actual.and,
    },
  };
});

describe("Risk Engine Worker (Phase 9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should process match risk evaluation correctly", async () => {
    const mockMatch = {
      id: "match-1",
      status: "pending_verification",
      hostUserId: "user-1",
    };

    (db.limit as any).mockResolvedValue([mockMatch]);

    const job: any = {
      id: "job-1",
      data: { type: "match", matchId: "match-1" },
    };

    await processRiskEvaluation(job);

    // If score is 0 (as mocked in the worker), it should approve the match
    expect(db.transaction).toHaveBeenCalled();
  });

  it("should skip evaluation if match is already completed (DB recheck)", async () => {
    const mockMatch = {
      id: "match-2",
      status: "completed",
    };

    (db.limit as any).mockResolvedValue([mockMatch]);

    const job: any = {
      id: "job-2",
      data: { type: "match", matchId: "match-2" },
    };

    await processRiskEvaluation(job);

    expect(db.transaction).not.toHaveBeenCalled();
  });
});
