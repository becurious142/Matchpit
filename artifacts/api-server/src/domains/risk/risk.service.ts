import { riskRepository } from "./risk.repository";
import { logger } from "../../lib/logger";

export class RiskService {
  async getOpenFraudFlags() {
    return await riskRepository.getOpenFraudFlags();
  }

  async resolveFraudFlag(flagId: string, resolution: "resolved" | "dismissed", action: string, adminId: string) {
    const flag = await riskRepository.resolveFraudFlag(flagId, resolution, action, adminId);
    
    if (flag) {
      logger.info({ flagId, resolution, admin: adminId }, "Admin resolved fraud flag");
      // TODO: Perform any required actions based on `action` (e.g. block user, release payout)
    }

    return flag;
  }

  async getRiskEventsByUserId(userId: string) {
    return await riskRepository.getRiskEventsByUserId(userId);
  }
}

export const riskService = new RiskService();
