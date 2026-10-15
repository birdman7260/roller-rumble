import type { QueueEntry } from "@roller-rumble/shared/types";

/** Hype lines the next race card leads with a few spots back from the front. */
const HYPE_LINES: Record<number, string> = {
  3: "Get the mind right",
  4: "Start stretching"
};

function formatEstimate(racesAhead: number, minutesPerRace: number): string {
  const minutes = racesAhead * minutesPerRace;
  return `in ${String(minutes)} ${minutes === 1 ? "minute" : "minutes"}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The estimated time until a queued race with `racesAhead` races in front of it, from the admin's
 * minutes-per-race setting.
 */
export function getQueuePositionLabel(racesAhead: number, minutesPerRace: number): string {
  return racesAhead === 0 ? "NOW!" : capitalize(formatEstimate(racesAhead, minutesPerRace));
}

/** Like {@link getQueuePositionLabel}, but a few spots back it leads with a hype line. */
export function getNextRaceTimingLabel(racesAhead: number, minutesPerRace: number): string {
  const hypeLine = HYPE_LINES[racesAhead];
  return hypeLine
    ? `${hypeLine} (${formatEstimate(racesAhead, minutesPerRace)})`
    : getQueuePositionLabel(racesAhead, minutesPerRace);
}

/** What a queue shows for an unanswered `challenge request` in place of a time. */
export const AWAITING_ANSWER_LABEL = "Waiting on an answer";

/**
 * How many races run before the entry at `index`. An unanswered `challenge request` is skipped when
 * the next race is staged, so it holds its spot without holding up anyone behind it.
 */
export function countRacesAhead(queue: QueueEntry[], index: number): number {
  return queue.slice(0, index).filter((entry) => !entry.awaitingRacerId).length;
}

/** Like {@link getQueueEntryTimingLabel}, for the next race card: with its hype lines. */
export function getNextRaceEntryTimingLabel(
  queue: QueueEntry[],
  index: number,
  minutesPerRace: number
): string {
  return queue[index]?.awaitingRacerId
    ? AWAITING_ANSWER_LABEL
    : getNextRaceTimingLabel(countRacesAhead(queue, index), minutesPerRace);
}

/** The queue list's label for the entry at `index`: its estimated time, or that it waits on an answer. */
export function getQueueEntryTimingLabel(
  queue: QueueEntry[],
  index: number,
  minutesPerRace: number
): string {
  return queue[index]?.awaitingRacerId
    ? AWAITING_ANSWER_LABEL
    : getQueuePositionLabel(countRacesAhead(queue, index), minutesPerRace);
}
