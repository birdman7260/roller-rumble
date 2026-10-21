import type { RacerSummary } from "@roller-rumble/shared/types";
import { describe, expect, it } from "vitest";
import { sortRacers } from "./racer-sort";

function racer(
  displayName: string,
  overrides: {
    realName?: string | null;
    eventRaces?: number;
    eventWins?: number;
    eventBestFinishTimeMs?: number | null;
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
    // The all-time figures are the same for everyone, so only the event figures can order the list.
    stats: {
      races: 50,
      wins: 50,
      eventRaces: overrides.eventRaces ?? 0,
      eventWins: overrides.eventWins ?? 0,
      careerRaces: 50,
      careerEventCount: 3,
      bestFinishTimeMs: 1_000,
      topSpeedKph: 80,
      averageSpeedKph: 60,
      maxWattage: 1_500,
      eventBestFinishTimeMs: overrides.eventBestFinishTimeMs ?? null,
      eventTopSpeedKph: null,
      eventAverageSpeedKph: null,
      eventMaxWattage: null
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

  it("orders by fastest time this event, quickest first when ascending, unfinished racers last", () => {
    const racers = [
      racer("Unfinished"),
      racer("Slow", { eventBestFinishTimeMs: 61_250 }),
      racer("Quick", { eventBestFinishTimeMs: 28_430 })
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

  it("orders by number of races this event, breaking ties by display name", () => {
    const racers = [
      racer("Cobra", { eventRaces: 2 }),
      racer("Rookie", { eventRaces: 0 }),
      racer("Veteran", { eventRaces: 7 }),
      racer("Ace", { eventRaces: 2 })
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

  it("orders by number of wins this event", () => {
    const racers = [
      racer("Winless", { eventRaces: 5, eventWins: 0 }),
      racer("Champ", { eventRaces: 5, eventWins: 4 }),
      racer("Decent", { eventRaces: 5, eventWins: 2 })
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
