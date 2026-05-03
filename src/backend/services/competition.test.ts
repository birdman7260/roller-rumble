import { describe, expect, it } from "vitest";
import type { RaceResult, Racer } from "../../shared/types";
import {
  advanceDoubleElimination,
  advanceSingleElimination,
  buildSeeds,
  computeRoundRobinStandings,
  createDoubleEliminationNodes,
  createRoundRobinMatches,
  createSingleEliminationNodes
} from "./competition";

const racers: Racer[] = [
  {
    id: "r1",
    displayName: "Avery",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r2",
    displayName: "Blake",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r3",
    displayName: "Casey",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  { id: "r4", displayName: "Drew", avatarUrl: null, createdAt: "x", updatedAt: "x", identities: [] }
];

const extendedRacers: Racer[] = [
  ...racers,
  {
    id: "r5",
    displayName: "Emery",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r6",
    displayName: "Finley",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r7",
    displayName: "Gray",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  {
    id: "r8",
    displayName: "Harper",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
  { id: "r9", displayName: "Indy", avatarUrl: null, createdAt: "x", updatedAt: "x", identities: [] }
];

const results: RaceResult[] = [
  {
    id: "res1",
    eventId: "e1",
    raceId: "ra1",
    racerId: "r1",
    lane: "solo",
    placement: 1,
    finishTimeMs: 10000,
    distanceMeters: 250,
    avgSpeedKph: 30,
    topSpeedKph: 38,
    maxWattage: 420,
    createdAt: "x"
  },
  {
    id: "res2",
    eventId: "e1",
    raceId: "ra2",
    racerId: "r2",
    lane: "solo",
    placement: 1,
    finishTimeMs: 10500,
    distanceMeters: 250,
    avgSpeedKph: 29,
    topSpeedKph: 35,
    maxWattage: 390,
    createdAt: "x"
  }
];

describe("competition service", () => {
  it("builds seeds from event results while preserving racers with no prior data", () => {
    const seeds = buildSeeds(racers, results);
    expect(seeds[0].racerId).toBe("r1");
    expect(seeds).toHaveLength(4);
    expect(seeds.find((seed) => seed.racerId === "r3")?.score).toBe(0);
  });

  it("advances winners in single elimination brackets", () => {
    const seeds = buildSeeds(racers, results);
    const nodes = createSingleEliminationNodes("stage-1", "t1", seeds);
    const roundOne = nodes.find((node) => node.slotLabel === "W1.1");
    expect(roundOne).toBeTruthy();
    const advanced = advanceSingleElimination(nodes, roundOne!.id, roundOne!.racerAId!);
    const nextRound = advanced.find((node) => node.slotLabel === "W2.1");
    expect(nextRound?.racerAId).toBe(roundOne!.racerAId);
  });

  it("drops first-round losers into the losers bracket in double elimination", () => {
    const seeds = buildSeeds(racers, results);
    const nodes = createDoubleEliminationNodes("stage-2", "t2", seeds);
    const roundOne = nodes.find((node) => node.slotLabel === "WB1.1");
    expect(roundOne?.racerAId).toBeTruthy();
    expect(roundOne?.racerBId).toBeTruthy();
    const winner = roundOne!.racerAId!;
    const loser = roundOne!.racerBId!;
    const advanced = advanceDoubleElimination(nodes, roundOne!.id, winner);
    const losersNode = advanced.find((node) => node.id === roundOne!.loserToNodeId);
    expect([losersNode?.racerAId, losersNode?.racerBId]).toContain(loser);
  });

  it("computes round robin standings from match winners", () => {
    const seeds = buildSeeds(racers.slice(0, 3), results);
    const matches = createRoundRobinMatches(seeds);
    matches[0].winnerRacerId = matches[0].racerAId;
    matches[1].winnerRacerId = matches[1].racerAId;
    const standings = computeRoundRobinStandings(seeds, matches);
    expect(standings[0].wins).toBeGreaterThanOrEqual(1);
    expect(standings[0].rank).toBe(1);
  });

  it("auto-advances byes without hanging in uneven single elimination brackets", () => {
    const seeds = buildSeeds(extendedRacers, results);
    const nodes = createSingleEliminationNodes("stage-uneven", "t-uneven", seeds);

    expect(nodes).toHaveLength(15);
    expect(nodes.some((node) => node.state === "bye" && node.winnerRacerId)).toBe(true);
    expect(
      nodes.some(
        (node) =>
          node.roundNumber === 2 &&
          Boolean(node.racerAId ?? node.racerBId) &&
          node.winnerRacerId == null
      )
    ).toBe(true);
  });

  it("does not pre-award a later-round winner while a sibling feeder match is still unresolved", () => {
    const seeds = buildSeeds(extendedRacers.slice(0, 5), results);
    const nodes = createSingleEliminationNodes("stage-byes", "t-byes", seeds);
    const roundOneBye = nodes.find((node) => node.slotLabel === "W1.1");
    const roundOneMatch = nodes.find((node) => node.slotLabel === "W1.2");

    expect(roundOneBye?.racerAId).toBeTruthy();
    expect(roundOneBye?.racerBId).toBeNull();
    expect(roundOneMatch?.racerAId).toBeTruthy();
    expect(roundOneMatch?.racerBId).toBeTruthy();

    const afterBye = advanceSingleElimination(nodes, roundOneBye!.id, roundOneBye!.racerAId!);
    const semifinal = afterBye.find((node) => node.slotLabel === "W2.1");

    expect(semifinal).toMatchObject({
      state: "pending",
      racerAId: roundOneBye!.racerAId,
      winnerRacerId: null
    });

    const afterMatch = advanceSingleElimination(
      afterBye,
      roundOneMatch!.id,
      roundOneMatch!.racerAId!
    );
    const readySemifinal = afterMatch.find((node) => node.slotLabel === "W2.1");

    expect(readySemifinal).toMatchObject({
      state: "ready",
      racerAId: roundOneBye!.racerAId,
      racerBId: roundOneMatch!.racerAId,
      winnerRacerId: null
    });
  });

  it("builds double elimination brackets for uneven fields", () => {
    const seeds = buildSeeds(extendedRacers, results);
    const nodes = createDoubleEliminationNodes("stage-double-uneven", "t-double-uneven", seeds);

    expect(nodes.some((node) => node.slotLabel.startsWith("WB"))).toBe(true);
    expect(nodes.some((node) => node.slotLabel.startsWith("LB"))).toBe(true);
    expect(nodes.some((node) => node.state === "bye" && node.winnerRacerId)).toBe(true);
  });
});
