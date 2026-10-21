import type { AppSnapshot } from "@roller-rumble/shared/types";

export interface TournamentStartForecast {
  /** Time left until the planned start; negative once it has passed. */
  msUntilStart: number;
  /** How long the races still to run will take at the current `race pace`. */
  msToClearQueue: number;
  /** Races that still fit before the start beyond those queued; negative when the queue runs over. */
  spareRaces: number;
  /** Whether the queue clears by the planned start. */
  onTrack: boolean;
}

/**
 * The open-queue races still to run: everything queued (a staged race's entry is still in the
 * queue), plus a race already under way, whose entry has left it.
 */
export function countRacesToRun(snapshot: Pick<AppSnapshot, "queue" | "raceProjection">): number {
  const raceState = snapshot.raceProjection.race?.state;
  const raceUnderWay =
    raceState === "countdown" || raceState === "active" || raceState === "interrupted";
  return snapshot.queue.length + (raceUnderWay ? 1 : 0);
}

/** Whether the races still to run fit before the planned tournament start, at the current pace. */
export function forecastTournamentStart({
  startsAt,
  nowMs,
  racesRemaining,
  secondsPerRace
}: {
  startsAt: string;
  nowMs: number;
  racesRemaining: number;
  secondsPerRace: number;
}): TournamentStartForecast {
  const msPerRace = secondsPerRace * 1000;
  const msUntilStart = Date.parse(startsAt) - nowMs;
  const msToClearQueue = racesRemaining * msPerRace;
  return {
    msUntilStart,
    msToClearQueue,
    spareRaces: Math.floor(msUntilStart / msPerRace) - racesRemaining,
    onTrack: msToClearQueue <= msUntilStart
  };
}

/** How long before the planned tournament start the host gets the `tournament start check`. */
export const TOURNAMENT_START_CHECK_LEAD_MS = 20 * 60_000;

/**
 * Whether to put the `tournament start check` in front of the host: from twenty minutes before
 * the planned start until they answer it. It only asks while closing the queue is still a choice
 * to make — the queue is open and no tournament has started.
 */
export function isTournamentStartCheckDue({
  startsAt,
  dismissedAt,
  queueOpen,
  tournamentActive,
  nowMs
}: {
  startsAt: string | null;
  dismissedAt: string | null;
  queueOpen: boolean;
  tournamentActive: boolean;
  nowMs: number;
}): boolean {
  if (!startsAt || dismissedAt || !queueOpen || tournamentActive) {
    return false;
  }
  return nowMs >= Date.parse(startsAt) - TOURNAMENT_START_CHECK_LEAD_MS;
}

const TIME_OF_DAY_PATTERN = /^(\d{2}):(\d{2})$/;
const HALF_DAY_MS = 12 * 60 * 60_000;

/**
 * Turns the host's "HH:MM" pick into the planned start: that wall-clock time on whichever day
 * lands nearest to now, so a 12:30 AM start picked at 10 PM means tonight, not this morning.
 * Null for a blank or malformed time.
 */
export function resolvePlannedStart(timeOfDay: string, nowMs: number): string | null {
  const match = TIME_OF_DAY_PATTERN.exec(timeOfDay);
  if (!match) {
    return null;
  }
  const start = new Date(nowMs);
  start.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (start.getTime() - nowMs > HALF_DAY_MS) {
    start.setDate(start.getDate() - 1);
  } else if (nowMs - start.getTime() > HALF_DAY_MS) {
    start.setDate(start.getDate() + 1);
  }
  return start.toISOString();
}
