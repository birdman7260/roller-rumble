/** Hype lines that stand in for the time estimate a few spots back from the front. */
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
 * A playful time-until label for a queued race with `racesAhead` races in front of it, estimated
 * from the admin's minutes-per-race setting.
 */
export function getQueuePositionLabel(racesAhead: number, minutesPerRace: number): string {
  if (racesAhead === 0) {
    return "NOW!";
  }
  return HYPE_LINES[racesAhead] ?? capitalize(formatEstimate(racesAhead, minutesPerRace));
}

/** Like {@link getQueuePositionLabel}, but a hype line also carries the estimate in parentheses. */
export function getNextRaceTimingLabel(racesAhead: number, minutesPerRace: number): string {
  const hypeLine = HYPE_LINES[racesAhead];
  return hypeLine
    ? `${hypeLine} (${formatEstimate(racesAhead, minutesPerRace)})`
    : getQueuePositionLabel(racesAhead, minutesPerRace);
}
