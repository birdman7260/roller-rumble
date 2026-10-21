import type { RacerSummary } from "@roller-rumble/shared/types";
import { describe, expect, it } from "vitest";
import { sortRacers } from "./racer-sort";

function racer(
  displayName: string,
  overrides: {
    realName?: string | null;
    races?: number;
    wins?: number;
    bestFinishTimeMs?: number | null;
  } = {}
): RacerSummary {
  return {
    racer: {
      id: displayName.toLowerCase(),
      displayName,
      realName: overrides.realName ?? null,
      email: null,
      phone: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z"
    },
    stats: {
      races: overrides.races ?? 0,
      wins: overrides.wins ?? 0,
      eventRaces: overrides.races ?? 0,
      eventWins: overrides.wins ?? 0,
      careerRaces: overrides.races ?? 0,
      careerEventCount: 1,
      bestFinishTimeMs: overrides.bestFinishTimeMs ?? null,
      topSpeedKph: 0,
      averageSpeedKph: 0,
      maxWattage: 0
    },
    payment: { status: "unpaid" }
  };
}

function names(racers: RacerSummary[]): string[] {
  return racers.map((entry) => entry.racer.displayName);
}

describe("sortRacers", () => {
  it("orders by display name A to Z or Z to A, ignoring case", () => {
    const racers = [racer("zippy"), racer("Bolt"), racer("apex")];

    expect(names(sortRacers(racers, { key: "displayName", direction: "asc" }))).toEqual([
      "apex",
      "Bolt",
      "zippy"
    ]);
    expect(names(sortRacers(racers, { key: "displayName", direction: "desc" }))).toEqual([
      "zippy",
      "Bolt",
      "apex"
    ]);
  });

  it("orders by real name, keeping racers without one at the bottom either way", () => {
    const racers = [
      racer("NoName"),
      racer("Bolt", { realName: "Zoe Quinn" }),
      racer("Apex", { realName: "  " }),
      racer("Zippy", { realName: "ada lovelace" })
    ];

    expect(names(sortRacers(racers, { key: "realName", direction: "asc" }))).toEqual([
      "Zippy",
      "Bolt",
      "Apex",
      "NoName"
    ]);
    expect(names(sortRacers(racers, { key: "realName", direction: "desc" }))).toEqual([
      "Bolt",
      "Zippy",
      "Apex",
      "NoName"
    ]);
  });

  it("orders by fastest time, quickest first when ascending, unfinished racers last", () => {
    const racers = [
      racer("Unfinished"),
      racer("Slow", { bestFinishTimeMs: 61_250 }),
      racer("Quick", { bestFinishTimeMs: 28_430 })
    ];

    expect(names(sortRacers(racers, { key: "fastestTime", direction: "asc" }))).toEqual([
      "Quick",
      "Slow",
      "Unfinished"
    ]);
    expect(names(sortRacers(racers, { key: "fastestTime", direction: "desc" }))).toEqual([
      "Slow",
      "Quick",
      "Unfinished"
    ]);
  });

  it("orders by number of races, breaking ties by display name", () => {
    const racers = [
      racer("Cobra", { races: 2 }),
      racer("Rookie", { races: 0 }),
      racer("Veteran", { races: 7 }),
      racer("Ace", { races: 2 })
    ];

    expect(names(sortRacers(racers, { key: "races", direction: "desc" }))).toEqual([
      "Veteran",
      "Ace",
      "Cobra",
      "Rookie"
    ]);
    expect(names(sortRacers(racers, { key: "races", direction: "asc" }))).toEqual([
      "Rookie",
      "Ace",
      "Cobra",
      "Veteran"
    ]);
  });

  it("orders by number of wins", () => {
    const racers = [
      racer("Winless", { races: 5, wins: 0 }),
      racer("Champ", { races: 5, wins: 4 }),
      racer("Decent", { races: 5, wins: 2 })
    ];

    expect(names(sortRacers(racers, { key: "wins", direction: "desc" }))).toEqual([
      "Champ",
      "Decent",
      "Winless"
    ]);
    expect(names(sortRacers(racers, { key: "wins", direction: "asc" }))).toEqual([
      "Winless",
      "Decent",
      "Champ"
    ]);
  });
});
