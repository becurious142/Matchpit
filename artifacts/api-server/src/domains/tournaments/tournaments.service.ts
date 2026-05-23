import { db, tournamentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { LedgerService } from "../finance/ledger.service";

export class TournamentsService {
  /**
   * Creates a new manual tournament.
   */
  static async createTournament(organizerId: string, name: string, sport: string, format: "knockout" | "round_robin" = "knockout") {
    const [tournament] = await db.insert(tournamentsTable).values({
      name,
      organizerId,
      sport,
      format,
      status: "draft"
    }).returning();

    logger.info({ organizerId, tournamentId: tournament.id }, "Tournament created");
    return tournament;
  }

  /**
   * Settles a tournament prize pool. 
   * MUST use the immutable financial ledger.
   */
  static async distributePrizePool(tournamentId: string, winningTeamId: string, winnerUserId: string, amount: number) {
    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
    
    if (!tournament || tournament.status !== "completed") {
      throw new Error("Tournament must be completed to distribute prize");
    }

    // Explicit Phase 18 Constraint: Prize pools MUST NEVER bypass immutable ledger.
    // Record the payout in the ledger with a tournament_prize tag.
    await LedgerService.recordTransaction({
      userId: winnerUserId,
      amount: amount,
      type: "credit",
      referenceId: tournamentId,
      referenceType: "tournament_prize",
      metadata: { winningTeamId }
    });

    logger.info({ tournamentId, winningTeamId, amount }, "Tournament prize distributed via ledger");
  }
}
