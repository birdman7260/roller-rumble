import type { RaceResult, TopRacersEntry } from "@roller-rumble/shared/types";
import type { AppDatabase } from "../db/Database";
import { hasReachedFinishLine } from "./finish-line";

interface QualifyingRun {
  createdAt: string;
  finishTimeMs: number;
  raceId: string;
  racerId: string;
}

/**
 * Fastest first, then the earlier run, then racer id — a total order, so a board re-derived on
 * every snapshot broadcast never swaps two tied rows between frames (ADR 0022).
 */
function compareRuns(left: QualifyingRun, right: QualifyingRun): number {
  return (
    left.finishTimeMs - right.finishTimeMs ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.racerId.localeCompare(right.racerId)
  );
}

/**
 * The `top racers board`: each racer's best qualifying run, fastest first, cut to `rows`. A run
 * qualifies when it belongs to the active event, its race was run at the event's current race
 * distance, and the rider actually reached the line (ADR 0022).
 */
export function rankTopRacers({
  eventId,
  raceDistanceMeters,
  raceTargetDistanceById,
  results,
  rows
}: {
  eventId: string;
  raceDistanceMeters: number;
  /** Each of the event's races' target distance, keyed by race id. */
  raceTargetDistanceById: ReadonlyMap<string, number>;
  results: readonly RaceResult[];
  rows: number;
}): TopRacersEntry[] {
  const bestRunByRacerId = new Map<string, QualifyingRun>();

  for (const result of results) {
    const targetDistanceMeters = raceTargetDistanceById.get(result.raceId);
    if (
      result.eventId !== eventId ||
      typeof result.finishTimeMs !== "number" ||
      targetDistanceMeters !== raceDistanceMeters ||
      !hasReachedFinishLine(result.distanceMeters, targetDistanceMeters)
    ) {
      continue;
    }

    const run: QualifyingRun = {
      createdAt: result.createdAt,
      finishTimeMs: result.finishTimeMs,
      raceId: result.raceId,
      racerId: result.racerId
    };
    const best = bestRunByRacerId.get(run.racerId);
    if (!best || compareRuns(run, best) < 0) {
      bestRunByRacerId.set(run.racerId, run);
    }
  }

  return [...bestRunByRacerId.values()]
    .sort(compareRuns)
    .slice(0, rows)
    .map(({ finishTimeMs, raceId, racerId }) => ({ racerId, raceId, finishTimeMs }));
}

/**
 * Every racer's best qualifying run in the event, fastest first and uncut. The top racers board,
 * the `bracket cutoff` and tournament seeding all read this one ranking, so the time the projector
 * posts is exactly the time the bracket seeds by (ADR 0027).
 */
export function rankEventBestRuns(
  db: Pick<AppDatabase, "listRaceTargetDistances">,
  {
    eventId,
    raceDistanceMeters,
    results
  }: { eventId: string; raceDistanceMeters: number; results: readonly RaceResult[] }
): TopRacersEntry[] {
  return rankTopRacers({
    eventId,
    raceDistanceMeters,
    raceTargetDistanceById: db.listRaceTargetDistances(eventId),
    results,
    rows: Number.POSITIVE_INFINITY
  });
}
