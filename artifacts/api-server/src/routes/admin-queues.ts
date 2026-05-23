import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { getProfileByClerkId, requireAuth } from "../lib/auth";
import { getQueueByName, ALL_QUEUE_NAMES } from "../queues/queues";
import { QueueName } from "../queues/retry-policies";
import { Job } from "bullmq";

const router: IRouter = Router();

async function requireAdmin(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  const profile = await getProfileByClerkId(userId);
  if (!profile?.isAdmin) {
    res.status(403).json({ error: "forbidden", message: "Admin access required" });
    return null;
  }
  return profile;
}

function sanitizeJobData(data: any): any {
  if (!data) return data;
  const sanitized = { ...data };
  
  // Basic masking of PII / tokens
  const maskedKeys = ["token", "password", "secret", "email", "phone"];
  for (const key of Object.keys(sanitized)) {
    if (maskedKeys.some(mk => key.toLowerCase().includes(mk))) {
      sanitized[key] = "***MASKED***";
    } else if (typeof sanitized[key] === "object") {
      sanitized[key] = sanitizeJobData(sanitized[key]);
    }
  }
  return sanitized;
}

function formatJob(job: Job) {
  return {
    id: job.id,
    name: job.name,
    data: sanitizeJobData(job.data),
    opts: job.opts,
    progress: job.progress,
    delay: job.delay,
    timestamp: job.timestamp,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace,
    returnvalue: job.returnvalue,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
  };
}

// Get all queues and their counts
router.get("/admin/queues", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const queuesStats = await Promise.all(
      ALL_QUEUE_NAMES.map(async (name) => {
        const queue = getQueueByName(name);
        const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
        return { name, counts };
      })
    );

    res.json({ queues: queuesStats });
  } catch (err: any) {
    req.log.error({ err }, "Error fetching queue stats");
    res.status(500).json({ error: "error", message: err.message });
  }
});

// Get jobs for a specific queue
router.get("/admin/queues/:name/jobs", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const name = req.params.name as QueueName;
    if (!ALL_QUEUE_NAMES.includes(name)) {
      res.status(400).json({ error: "bad_request", message: "Invalid queue name" });
      return;
    }

    const queue = getQueueByName(name);
    const status = (req.query.status as string) || "failed";
    const start = parseInt((req.query.start as string) || "0", 10);
    const end = parseInt((req.query.end as string) || "50", 10);
    
    const statusTypes = status.split(',') as any[];

    const jobs = await queue.getJobs(statusTypes, start, end);
    const formattedJobs = jobs.map(formatJob);

    res.json({ jobs: formattedJobs });
  } catch (err: any) {
    req.log.error({ err }, "Error fetching queue jobs");
    res.status(500).json({ error: "error", message: err.message });
  }
});

// Retry a specific job
router.post("/admin/queues/:name/jobs/:id/retry", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const name = req.params.name as QueueName;
    if (!ALL_QUEUE_NAMES.includes(name)) {
      res.status(400).json({ error: "bad_request", message: "Invalid queue name" });
      return;
    }

    const queue = getQueueByName(name);
    const job = await queue.getJob(req.params.id as string);

    if (!job) {
      res.status(404).json({ error: "not_found", message: "Job not found" });
      return;
    }

    await job.retry();
    res.json({ success: true, message: "Job queued for retry" });
  } catch (err: any) {
    req.log.error({ err }, "Error retrying job");
    res.status(500).json({ error: "error", message: err.message });
  }
});

// Delete a specific job
router.delete("/admin/queues/:name/jobs/:id", requireAuth, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const name = req.params.name as QueueName;
    if (!ALL_QUEUE_NAMES.includes(name)) {
      res.status(400).json({ error: "bad_request", message: "Invalid queue name" });
      return;
    }

    const queue = getQueueByName(name);
    const job = await queue.getJob(req.params.id as string);

    if (!job) {
      res.status(404).json({ error: "not_found", message: "Job not found" });
      return;
    }

    await job.remove();
    res.json({ success: true, message: "Job removed" });
  } catch (err: any) {
    req.log.error({ err }, "Error removing job");
    res.status(500).json({ error: "error", message: err.message });
  }
});

export { router as adminQueuesRouter };
