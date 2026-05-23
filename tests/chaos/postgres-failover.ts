import { test, expect } from "vitest";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

test("Chaos: Postgres connection drops mid-transaction", async () => {
  // We simulate a primary failover by terminating the backend connection
  // of an active transaction. We expect the application logic to correctly
  // catch the error and bubble it up without committing partial state.
  
  let caughtError = false;
  
  try {
    await db.transaction(async (tx) => {
      // Execute a simple query to ensure the connection is active
      await tx.execute(sql`SELECT 1`);
      
      // Deliberately kill the transaction's own backend process (simulating a drop/failover)
      // We run this async so we don't block the connection
      await db.execute(sql`SELECT pg_terminate_backend(pg_backend_pid())`);
      
      // Try to execute another query
      await tx.execute(sql`SELECT 2`); // This should throw
    });
  } catch (error: any) {
    caughtError = true;
    expect(error.message).toMatch(/terminating connection/i);
  }
  
  expect(caughtError).toBe(true);
});
