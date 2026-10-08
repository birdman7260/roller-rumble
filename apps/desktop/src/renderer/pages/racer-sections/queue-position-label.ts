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
