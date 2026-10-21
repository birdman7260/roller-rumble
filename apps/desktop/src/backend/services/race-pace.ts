import type { RacePace } from "@roller-rumble/shared/types";

/** How many of the latest finish-to-finish gaps the pace reads, so it tracks the current rhythm. */
const RACE_PACE_WINDOW = 10;

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * The `race pace`: the time the event is taking per race, read from the gaps between its race
 * finishes. A finish-to-finish gap holds everything a race really costs the host — staging,
 * swapping riders, the countdown, and the ride itself. It reads the median of the latest gaps, so
 * one long break between races doesn't drag the pace out.
 */
export function measureRacePace({
  finishTimes,
  defaultMinutesPerRace
}: {
  /** Finish timestamps of the event's finished races, in any order. */
  finishTimes: string[];
  /** The operator's `queueMinutesPerRace`, used until there is a gap to measure. */
  defaultMinutesPerRace: number;
}): RacePace {
  const finishTimesMs = finishTimes.map((at) => Date.parse(at)).sort((left, right) => left - right);
  const gapsMs = finishTimesMs
    .slice(1)
    .map((finishMs, index) => finishMs - finishTimesMs[index])
    .slice(-RACE_PACE_WINDOW);
  if (gapsMs.length === 0) {
    return { secondsPerRace: defaultMinutesPerRace * 60, source: "default", sampleCount: 0 };
  }

  return {
    secondsPerRace: Math.round(median(gapsMs) / 1000),
    source: "measured",
    sampleCount: gapsMs.length
  };
}
