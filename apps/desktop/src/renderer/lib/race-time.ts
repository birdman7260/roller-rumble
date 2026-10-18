/** A finishing time as the projector shows it, to the hundredth: "28.43s", or "1:02.57" past a minute. */
export function formatRaceTime(ms: number | undefined): string {
  // Round to whole hundredths before splitting, so 59.996s carries to "1:00.00" rather than "60.00s".
  const totalCentiseconds = Math.round(Math.max(0, ms ?? 0) / 10);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = ((totalCentiseconds % 6000) / 100).toFixed(2);
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}:${seconds.padStart(5, "0")}`;
}
