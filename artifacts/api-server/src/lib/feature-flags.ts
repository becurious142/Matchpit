import { env } from "../config/env";
import crypto from "crypto";

export const FeatureFlags = {
  // Boolean flags from env
  ENABLE_REALTIME: env.ENABLE_REALTIME ?? true,
  ENABLE_RANKING_V2: process.env.ENABLE_RANKING_V2 === "true",
  ENABLE_LEDGER_RECONCILIATION: process.env.ENABLE_LEDGER_RECONCILIATION !== "false", // Default true
  ENABLE_GEO_PERSONALIZATION: process.env.ENABLE_GEO_PERSONALIZATION === "true",
  ENABLE_EVENT_REPLAY: process.env.ENABLE_EVENT_REPLAY !== "false", // Default true

  /**
   * Deterministic percentage rollout based on a unique string (e.g., userId).
   * Example: isFeatureEnabled("REALTIME", userId)
   */
  isRolloutEnabled(featureName: string, identifier: string): boolean {
    const rolloutPercentRaw = process.env[`${featureName}_ROLLOUT_PERCENT`];
    if (!rolloutPercentRaw) return false; // Default to 0 if not defined
    
    const rolloutPercent = parseInt(rolloutPercentRaw, 10);
    if (isNaN(rolloutPercent) || rolloutPercent <= 0) return false;
    if (rolloutPercent >= 100) return true;

    // Deterministic hash based on feature + identifier
    const hash = crypto.createHash("md5").update(`${featureName}:${identifier}`).digest("hex");
    // Convert first 4 chars to a number 0-99
    const hashInt = parseInt(hash.substring(0, 4), 16);
    const normalized = hashInt % 100;

    return normalized < rolloutPercent;
  }
};
