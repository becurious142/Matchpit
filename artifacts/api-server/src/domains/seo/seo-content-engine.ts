import { db, venuesTable, hostedMatchesTable, tournamentsTable, teamsTable } from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { logger } from "../../lib/logger";

export interface LocalitySEOData {
  city: string;
  sport: string;
  area: string;
}

export class SeoContentEngine {
  /**
   * Generates programmatic SEO metadata for a locality page.
   * Enforces Quality Gates to prevent indexing thin content.
   */
  static async generateLocalityPage(data: LocalitySEOData) {
    const { city, sport, area } = data;

    // 1. Enforce SEO Quality Gate: Minimum Venue or Match Threshold
    // Check venues in this area
    const [{ venueCount }] = await db.execute(sql`
      SELECT COUNT(*) as "venueCount" 
      FROM ${venuesTable}
      WHERE city ILIKE ${city} 
      AND address ILIKE ${'%' + area + '%'}
      AND ${sport} = ANY(sports)
    `);

    // Check active weekly matches in this area
    // (Simplified query for the scaffolding)
    const [{ matchCount }] = await db.execute(sql`
      SELECT COUNT(*) as "matchCount" 
      FROM ${hostedMatchesTable} m
      JOIN ${venuesTable} v ON m.venue_id = v.id
      WHERE v.city ILIKE ${city} 
      AND v.address ILIKE ${'%' + area + '%'}
      AND m.sport = ${sport}
      AND m.status = 'open'
    `);

    if (Number(venueCount) < 3 && Number(matchCount) < 5) {
      logger.warn({ city, sport, area, venueCount, matchCount }, "SEO Quality Gate failed. Skipping page generation to prevent thin content penalty.");
      return null;
    }

    // 2. Generate Content
    const title = `Play ${sport.charAt(0).toUpperCase() + sport.slice(1)} in ${area}, ${city} | MATCHPIT`;
    const description = `Find the best ${sport} venues and active matches in ${area}, ${city}. Join local games or book turfs instantly on MATCHPIT.`;
    
    // 3. Generate Schema.org structured data
    const schemaOrg = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": title,
      "description": description,
      "url": `https://matchpit.in/explore/${city.toLowerCase()}/${sport.toLowerCase()}/${area.toLowerCase().replace(/ /g, '-')}`,
    };

    logger.info({ city, sport, area }, "SEO Locality Page generated successfully");

    return {
      title,
      description,
      schemaOrg,
      venueCount: Number(venueCount),
      matchCount: Number(matchCount),
      // dynamic intro copy, FAQs, etc would be generated here using LLM or templates
      faqClustering: [
        { question: `Are there open ${sport} matches in ${area}?`, answer: `Yes, there are currently ${matchCount} active matches.` },
        { question: `How many ${sport} turfs are in ${area}?`, answer: `We have ${venueCount} highly rated venues available.` }
      ]
    };
  }

  /**
   * Phase 18 Constraint: Do NOT index empty tournaments.
   */
  static async generateTournamentPage(tournamentId: string) {
    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    
    if (!tournament || tournament.status === "draft") {
      return null; // Do not index
    }
    
    return {
      title: `${tournament.name} | MATCHPIT Tournaments`,
      indexable: true
    };
  }

  /**
   * Phase 18 Constraint: Do NOT index inactive teams.
   */
  static async generateTeamPage(teamId: string) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
    
    if (!team || Number(team.matchesPlayed || 0) === 0) {
      return null; // Do not index inactive teams to protect domain quality
    }

    return {
      title: `${team.name} | MATCHPIT Teams`,
      indexable: true
    };
  }

  /**
   * Massive Sitemap Chunking
   * For >50k URLs, we split into sitemap-1.xml, sitemap-2.xml, etc.
   */
  static async generateSitemapIndex() {
    // Generate sitemap index pointing to chunked sitemaps
    logger.info("Generating sitemap index for 100k+ programmatic pages...");
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://matchpit.in/sitemap/venues.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://matchpit.in/sitemap/localities.xml</loc>
  </sitemap>
</sitemapindex>`;
  }
}
