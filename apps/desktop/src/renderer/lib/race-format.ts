function splitRaceTime(ms: number | undefined): { minutes: number; seconds: string } {
  // Round to whole hundredths before splitting, so 59.996s carries to 1:00.00 rather than 60.00.
  const totalCentiseconds = Math.round(Math.max(0, ms ?? 0) / 10);
  return {
    minutes: Math.floor(totalCentiseconds / 6000),
    seconds: ((totalCentiseconds % 6000) / 100).toFixed(2)
  };
}

/** A finishing time as the projector shows it, to the hundredth: "28.43s", or "1:02.57" past a minute. */
export function formatRaceTime(ms: number | undefined): string {
  const { minutes, seconds } = splitRaceTime(ms);
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}:${seconds.padStart(5, "0")}`;
}

/** The live race clock, which always shows minutes: "0:28.43". */
export function formatRaceClock(ms: number): string {
  const { minutes, seconds } = splitRaceTime(ms);
  return `${minutes}:${seconds.padStart(5, "0")}`;
}

/** A racer's best finish as `formatRaceTime` shows it, or `noFinishText` before they have one. */
export function formatBestFinish(ms: number | null | undefined, noFinishText = "—"): string {
  return typeof ms === "number" ? formatRaceTime(ms) : noFinishText;
}

/** A speed to the tenth: "52.4 km/h", or a dash when there is no reading. */
export function formatSpeed(kph: number | null | undefined): string {
  return typeof kph === "number" ? `${kph.toFixed(1)} km/h` : "—";
}

/** Power in whole watts: "812 W", or a dash when there is no reading. */
export function formatPower(watts: number | null | undefined): string {
  return typeof watts === "number" ? `${Math.round(watts)} W` : "—";
}
