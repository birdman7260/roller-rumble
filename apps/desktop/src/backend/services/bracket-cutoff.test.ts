import { describe, expect, it } from "vitest";
import type { TopRacersEntry } from "@roller-rumble/shared/types";
import { findBracketCutoff } from "./bracket-cutoff";

/** Best runs fastest first, as `rankTopRacers` hands them over: 20.0s, 21.0s, 22.0s, ... */
function bestRuns(count: number): TopRacersEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    racerId: `racer-${index + 1}`,
    raceId: `race-${index + 1}`,
    finishTimeMs: 20_000 + index * 1000
  }));
}

describe("findBracketCutoff", () => {
  it("is the time of the last racer still inside the planned bracket", () => {
    expect(
      findBracketCutoff({
        plannedBracketSize: 4,
        eventBestRuns: bestRuns(6),
        tournamentActive: false
      })
    ).toEqual({ bracketSize: 4, finishTimeMs: 23_000 });
  });

  it("has no cutoff until enough racers have a time to fill the bracket", () => {
    expect(
      findBracketCutoff({
        plannedBracketSize: 8,
        eventBestRuns: bestRuns(7),
        tournamentActive: false
      })
    ).toBeNull();
  });

  it("has no cutoff while no bracket size is planned", () => {
    expect(
      findBracketCutoff({
        plannedBracketSize: null,
        eventBestRuns: bestRuns(6),
        tournamentActive: false
      })
    ).toBeNull();
  });

  it("goes away once the tournament is running, since the bracket is already seeded", () => {
    expect(
      findBracketCutoff({
        plannedBracketSize: 4,
        eventBestRuns: bestRuns(6),
        tournamentActive: true
      })
    ).toBeNull();
  });
});
