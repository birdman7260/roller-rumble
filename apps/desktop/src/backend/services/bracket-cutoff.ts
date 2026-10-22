import type {
  BracketCutoff,
  TopRacersEntry,
  TournamentBracketSize
} from "@roller-rumble/shared/types";

/**
 * The `bracket cutoff`: the time a racer must beat to seed into the planned bracket, which seeds
 * by event fastest time. It is the slowest best run still inside the bracket, so it only exists
 * once the bracket is full of qualifying times.
 */
export function findBracketCutoff({
  plannedBracketSize,
  eventBestRuns,
  tournamentActive
}: {
  plannedBracketSize: TournamentBracketSize | null;
  /** Every racer's best qualifying run this event, fastest first (`rankTopRacers`). */
  eventBestRuns: readonly TopRacersEntry[];
  /** A running tournament is already seeded, so there is nothing left to race into. */
  tournamentActive: boolean;
}): BracketCutoff | null {
  if (plannedBracketSize == null || tournamentActive) {
    return null;
  }

  const lastSeed = eventBestRuns.at(plannedBracketSize - 1);
  return lastSeed ? { bracketSize: plannedBracketSize, finishTimeMs: lastSeed.finishTimeMs } : null;
}
