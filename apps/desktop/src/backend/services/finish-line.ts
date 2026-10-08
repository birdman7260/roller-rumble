/**
 * Whether a rider covering `distanceMeters` has reached the line of a race run to
 * `targetDistanceMeters`. The one place that question is answered: `ActiveRace` uses it to decide a
 * lane has crossed, and the `top racers board` uses it to keep a force-finished partial run off the
 * board (ADR 0022), so the two can never disagree about what finishing means.
 */
export function hasReachedFinishLine(
  distanceMeters: number,
  targetDistanceMeters: number
): boolean {
  return distanceMeters >= targetDistanceMeters;
}
