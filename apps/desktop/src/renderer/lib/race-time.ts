/** A finishing time as the projector shows it, to the tenth: "28.4s", or "1:02.5" past a minute. */
export function formatRaceTime(ms: number | undefined): string {
  const totalMs = ms ?? 0;
  const minutes = Math.floor(totalMs / 60000);
  const seconds = (totalMs % 60000) / 1000;
  if (minutes === 0) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds.toFixed(1)}`;
}
