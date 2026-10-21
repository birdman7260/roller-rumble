import { describe, expect, it } from "vitest";
import { measureRacePace } from "./race-pace";

describe("measureRacePace", () => {
  it("falls back to the operator's minutes per race before any race has finished", () => {
    expect(measureRacePace({ finishTimes: [], defaultMinutesPerRace: 2 })).toEqual({
      secondsPerRace: 120,
      source: "default",
      sampleCount: 0
    });
  });

  it("keeps the default while only one race has finished, since there is no gap to measure", () => {
    expect(
      measureRacePace({ finishTimes: ["2026-10-20T19:00:00.000Z"], defaultMinutesPerRace: 2 })
    ).toEqual({ secondsPerRace: 120, source: "default", sampleCount: 0 });
  });

  it("measures the gap between race finishes, whatever order they arrive in", () => {
    expect(
      measureRacePace({
        finishTimes: [
          "2026-10-20T19:06:30.000Z",
          "2026-10-20T19:00:00.000Z",
          "2026-10-20T19:03:00.000Z"
        ],
        defaultMinutesPerRace: 2
      })
    ).toEqual({ secondsPerRace: 195, source: "measured", sampleCount: 2 });
  });

  it("follows the last ten gaps, so a slow start stops counting once the host finds a rhythm", () => {
    // Ten races four minutes apart, then ten more two minutes apart.
    const slowStart = Array.from({ length: 11 }, (_, index) => 19 * 60 + index * 4);
    const rhythm = Array.from({ length: 10 }, (_, index) => slowStart[10] + (index + 1) * 2);
    const finishTimes = [...slowStart, ...rhythm].map((minuteOfDay) =>
      minutesAfterMidnight(minuteOfDay)
    );

    expect(measureRacePace({ finishTimes, defaultMinutesPerRace: 2 })).toEqual({
      secondsPerRace: 120,
      source: "measured",
      sampleCount: 10
    });
  });

  it("is not dragged out by one long break between races", () => {
    const finishTimes = [0, 2, 4, 6, 36, 38].map((minute) =>
      minutesAfterMidnight(19 * 60 + minute)
    );

    expect(measureRacePace({ finishTimes, defaultMinutesPerRace: 3 }).secondsPerRace).toBe(120);
  });
});

function minutesAfterMidnight(minuteOfDay: number): string {
  return new Date(Date.UTC(2026, 9, 20, 0, minuteOfDay)).toISOString();
}
