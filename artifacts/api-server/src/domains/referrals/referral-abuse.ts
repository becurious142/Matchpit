import { db, referralsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

export interface ReferralFraudContext {
  ipAddress: string;
  deviceFingerprint: string;
  userAgent: string;
}

export class ReferralAbuseDetector {
  /**
   * Evaluates a referral attempt for abuse (farms, emulators, self-referrals).
   * Returns a risk score (0-100).
   */
  static async evaluateRisk(referrerId: string, context: ReferralFraudContext): Promise<number> {
    let score = 0;

    try {
      // 1. IP Clustering Check
      // Are there multiple referrals from this exact IP recently?
      const [{ ipCount }] = await db.execute(sql`
        SELECT COUNT(id) as "ipCount" FROM ${referralsTable}
        WHERE metadata->'fraudContext'->>'ipAddress' = ${context.ipAddress}
          AND created_at >= NOW() - INTERVAL '24 hours'
      `);
      if (Number(ipCount) > 3) score += 30;
      if (Number(ipCount) > 10) score += 80;

      // 2. Device Fingerprint Overlap
      // Has this device been used to sign up before?
      const [{ deviceCount }] = await db.execute(sql`
        SELECT COUNT(id) as "deviceCount" FROM ${referralsTable}
        WHERE metadata->'fraudContext'->>'deviceFingerprint' = ${context.deviceFingerprint}
      `);
      // Device reuse for signup is highly suspicious
      if (Number(deviceCount) > 0) score += 60;
      if (Number(deviceCount) > 2) score += 100; // Definite emulator/farm

      // 3. Emulator Heuristics (Basic check via User Agent)
      const isLikelyEmulator = /BlueStacks|Nox|Genymotion|Android SDK built for x86|Emulator/i.test(context.userAgent);
      if (isLikelyEmulator) score += 50;

      // 4. Rate Limiting Check on Referrer
      // Is this referrer spamming invites?
      const [{ velocity }] = await db.execute(sql`
        SELECT COUNT(id) as "velocity" FROM ${referralsTable}
        WHERE referrer_user_id = ${referrerId}
          AND created_at >= NOW() - INTERVAL '1 hour'
      `);
      if (Number(velocity) > 5) score += 40;

    } catch (err) {
      logger.error({ err, referrerId }, "Error running referral abuse detection");
      // Fail open but log
    }

    return Math.min(score, 100);
  }
}
