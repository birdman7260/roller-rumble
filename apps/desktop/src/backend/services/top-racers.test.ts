import type { RaceResult } from "@roller-rumble/shared/types";
import { describe, expect, it } from "vitest";
import { rankTopRacers } from "./top-racers";

const EVENT_ID = "event-1";
const RACE_DISTANCE = 250;

function result(patch: Partial<RaceResult> & Pick<RaceResult, "racerId">): RaceResult {
  return {
    id: `result-${patch.racerId}-${patch.raceId ?? "race-1"}`,
    eventId: EVENT_ID,
    raceId: "race-1",
    lane: "left",
    placement: 1,
    finishTimeMs: 30_000,
    distanceMeters: RACE_DISTANCE,
    avgSpeedKph: 30,
    topSpeedKph: 35,
    maxWattage: 300,
    createdAt: "2026-10-08T18:00:00.000Z",
    ...patch
  };
}

function rank(results: RaceResult[], overrides: { rows?: number } = {}) {
  const raceIds = new Set(results.map((entry) => entry.raceId));
  return rankTopRacers({
    eventId: EVENT_ID,
    raceDistanceMeters: RACE_DISTANCE,
    raceTargetDistanceById: new Map([...raceIds].map((raceId) => [raceId, RACE_DISTANCE])),
    results,
    rows: overrides.rows ?? 5
  });
}

describe("rankTopRacers", () => {
  it("orders racers fastest first", () => {
    expect(
      rank([
        result({ racerId: "ana", finishTimeMs: 31_000 }),
        result({ racerId: "ben", finishTimeMs: 29_500 })
      ])
    ).toEqual([
      { racerId: "ben", raceId: "race-1", finishTimeMs: 29_500 },
      { racerId: "ana", raceId: "race-1", finishTimeMs: 31_000 }
    ]);
  });

  it("gives each racer one row holding their best run", () => {
    expect(
      rank([
        result({ racerId: "ana", raceId: "race-1", finishTimeMs: 31_000 }),
        result({ racerId: "ana", raceId: "race-2", finishTimeMs: 28_000 }),
        result({ racerId: "ben", raceId: "race-2", finishTimeMs: 29_000 })
      ])
    ).toEqual([
      { racerId: "ana", raceId: "race-2", finishTimeMs: 28_000 },
      { racerId: "ben", raceId: "race-2", finishTimeMs: 29_000 }
    ]);
  });

  it("leaves off a rider who never reached the line", () => {
    // A force-finished rider still carries a plausible-looking time for a partial distance.
    expect(
      rank([
        result({ racerId: "ana", finishTimeMs: 31_000 }),
        result({ racerId: "ben", finishTimeMs: 33_000, distanceMeters: 140 })
      ]).map((entry) => entry.racerId)
    ).toEqual(["ana"]);
  });

  it("only ranks runs raced at the event's current race distance", () => {
    expect(
      rankTopRacers({
        eventId: EVENT_ID,
        raceDistanceMeters: RACE_DISTANCE,
        raceTargetDistanceById: new Map([
          ["race-250", 250],
          ["race-500", 500]
        ]),
        results: [
          result({ racerId: "ana", raceId: "race-250", finishTimeMs: 31_000 }),
          result({ racerId: "ben", raceId: "race-500", finishTimeMs: 20_000, distanceMeters: 500 })
        ],
        rows: 5
      }).map((entry) => entry.racerId)
    ).toEqual(["ana"]);
  });

  it("only ranks the active event's runs", () => {
    expect(
      rank([
        result({ racerId: "ana", finishTimeMs: 31_000 }),
        result({ racerId: "ben", finishTimeMs: 20_000, eventId: "event-0" })
      ]).map((entry) => entry.racerId)
    ).toEqual(["ana"]);
  });

  it("puts the earlier run first on a tied time", () => {
    expect(
      rank([
        result({ racerId: "ana", raceId: "race-2", createdAt: "2026-10-08T19:00:00.000Z" }),
        result({ racerId: "ben", raceId: "race-1", createdAt: "2026-10-08T18:00:00.000Z" })
      ]).map((entry) => entry.racerId)
    ).toEqual(["ben", "ana"]);
  });

  it("keeps a stable order for riders tied on time in the same race", () => {
    const tied = [result({ racerId: "ben" }), result({ racerId: "ana" })];
    expect(rank(tied).map((entry) => entry.racerId)).toEqual(["ana", "ben"]);
    expect(rank([...tied].reverse()).map((entry) => entry.racerId)).toEqual(["ana", "ben"]);
  });

  it("cuts the board to the row count", () => {
    expect(
      rank(
        ["ana", "ben", "cy", "dee"].map((racerId, index) =>
          result({ racerId, finishTimeMs: 30_000 + index })
        ),
        { rows: 3 }
      ).map((entry) => entry.racerId)
    ).toEqual(["ana", "ben", "cy"]);
  });

  it("is empty before anyone has finished a run", () => {
    expect(rank([])).toEqual([]);
  });
});
