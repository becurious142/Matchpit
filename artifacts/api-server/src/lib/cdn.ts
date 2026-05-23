import { logger } from "./logger";
import axios from "axios";

export const CDN = {
  /**
   * Purges cache for specific URLs in Cloudflare
   */
  async purgeCache(urls: string[]) {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const apiKey = process.env.CLOUDFLARE_API_KEY;

    if (!zoneId || !apiKey) {
      logger.debug({ urls }, "CDN purge skipped: credentials not configured");
      return;
    }

    try {
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
        { files: urls },
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );
      logger.info({ urls }, "Successfully purged CDN cache");
    } catch (err: any) {
      logger.error({ err: err.response?.data || err.message }, "Failed to purge CDN cache");
    }
  }
};
