import { test, expect } from "vitest";
import { strictLimiter } from "../../artifacts/api-server/src/middlewares/rate-limiter";

test("Security: Rate limiters enforce 429 Too Many Requests", async () => {
  // We mock a rapid succession of requests from the same IP
  const mockIp = "192.168.1.100";
  
  let rejected = false;

  // The strict limiter allows 30 requests per minute.
  // We simulate 35 requests.
  for (let i = 0; i < 35; i++) {
    const req = { ip: mockIp, path: "/api/matches/join" } as any;
    const res = {
      statusCode: 200,
      status: function(code: number) { this.statusCode = code; return this; },
      send: function(msg: string) { }
    } as any;
    
    await new Promise<void>((resolve) => {
      strictLimiter(req, res, (err?: any) => {
        resolve(); // next() called
      });
      // If handler was called, status might have changed
      if (res.statusCode === 429) {
        rejected = true;
        resolve();
      }
    });
  }

  // Expect the 35th request to have been rejected
  expect(rejected).toBe(true);
});
