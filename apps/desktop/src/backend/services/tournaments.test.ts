import { describe, expect, it } from "vitest";
import type { EventRecord, RaceResult, Racer } from "@goldsprints/shared/types";
import {
  canAutomaticallyReplaceTournamentRacer,
  fillBracketByeSlot,
  getTournamentAdminRemovedRacerIds,
  getTournamentRacerIdsWithIncompleteMatches,
  getTournamentSelfOptOutRacerIds,
  optOutTournamentRacer,
  TournamentService,
  undoBracketNodeResult
} from "./tournaments";

const event: EventRecord = {
  id: "event-1",
  name: "Bracket Night",
  includeAllRaceData: false,
  paymentAmountCents: null,
  paymentCurrency: "usd",
  paymentRequiredForQueue: false,
  active: true,
  createdAt: "x",
  updatedAt: "x"
};

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
  {
    id: "r4",
    displayName: "Drew",
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    identities: []
  },
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
    id: "res-1",
    eventId: event.id,
    raceId: "race-1",
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
    id: "res-2",
    eventId: event.id,
    raceId: "race-2",
    racerId: "r2",
    lane: "solo",
    placement: 1,
    finishTimeMs: 10300,
    distanceMeters: 250,
    avgSpeedKph: 29,
    topSpeedKph: 36,
    maxWattage: 400,
    createdAt: "x"
  }
];

describe("tournament service", () => {
  it("limits the elimination field to the chosen bracket size", () => {
    const service = new TournamentService();

    const bundle = service.createTournamentBundle({
      event,
      racers,
      results,
      name: "Top Eight",
      preset: "single-elimination",
      bracketSize: 8
    });

    expect(bundle.seeds).toHaveLength(8);
    expect(bundle.bracketNodes).toHaveLength(7);
    expect(bundle.tournament.settings).toMatchObject({
      eligibleRacerCount: 9,
      seedCount: 8,
      bracketSize: 8
    });
  });

  it("keeps larger brackets open for byes when the chosen size exceeds the field", () => {
    const service = new TournamentService();

    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 5),
      results,
      name: "Open Eight",
      preset: "single-elimination",
      bracketSize: 8
    });

    expect(bundle.seeds).toHaveLength(5);
    expect(bundle.bracketNodes).toHaveLength(7);
    expect(bundle.bracketNodes.some((node) => node.state === "bye")).toBe(true);
  });

  it("replaces an opted-out racer in an unplayed first-round bracket slot", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });

    const result = optOutTournamentRacer({
      bundle,
      optedOutRacerId: "r4",
      replacementSeed: {
        racerId: "r5",
        label: "Emery",
        score: 0,
        seed: 5
      }
    });

    expect(result?.replacedIn).toBe("bracket");
    expect(result?.replacementType).toBe("racer");
    expect(result?.bundle.seeds.find((seed) => seed.seed === 4)?.racerId).toBe("r5");
    expect(result?.bundle.bracketNodes.some((node) => node.racerAId === "r4")).toBe(false);
    expect(result?.bundle.bracketNodes.some((node) => node.racerBId === "r5")).toBe(true);
    expect(getTournamentSelfOptOutRacerIds(result!.bundle)).toContain("r4");
  });

  it("does not automatically replace a racer after their bracket result is recorded", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const node = bundle.bracketNodes.find((candidate) => candidate.racerBId === "r4")!;

    const progressedBundle = {
      ...bundle,
      bracketNodes: bundle.bracketNodes.map((candidate) =>
        candidate.id === node.id
          ? {
              ...candidate,
              state: "finished" as const,
              winnerRacerId: candidate.racerAId
            }
          : candidate
      )
    };

    const result = optOutTournamentRacer({
      bundle: progressedBundle,
      optedOutRacerId: "r4",
      replacementSeed: canAutomaticallyReplaceTournamentRacer(progressedBundle, "r4")
        ? {
            racerId: "r5",
            label: "Emery",
            score: 0,
            seed: 5
          }
        : null
    });

    expect(result?.replacementType).toBe("bye");
    expect(result?.bundle.seeds.some((seed) => seed.racerId === "r5")).toBe(false);
    expect(result?.bundle.seeds.some((seed) => seed.racerId === "r4")).toBe(false);
  });

  it("turns a later-round bracket slot into a bye instead of automatically replacing the racer", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const firstRoundNode = bundle.bracketNodes.find((candidate) => candidate.racerAId === "r1")!;
    const secondRoundNodeId = firstRoundNode.winnerToNodeId!;
    const progressedBundle = {
      ...bundle,
      bracketNodes: bundle.bracketNodes.map((candidate) =>
        candidate.id === firstRoundNode.id
          ? {
              ...candidate,
              state: "finished" as const,
              winnerRacerId: "r1"
            }
          : candidate.id === secondRoundNodeId
            ? {
                ...candidate,
                racerAId: "r1",
                racerBId: "r3",
                state: "ready" as const
              }
            : candidate
      )
    };

    const result = optOutTournamentRacer({
      bundle: progressedBundle,
      optedOutRacerId: "r1",
      replacementSeed: canAutomaticallyReplaceTournamentRacer(progressedBundle, "r1")
        ? {
            racerId: "r5",
            label: "Emery",
            score: 0,
            seed: 5
          }
        : null
    });
    const secondRoundNode = result?.bundle.bracketNodes.find(
      (candidate) => candidate.id === secondRoundNodeId
    );
    const completedFirstRoundNode = result?.bundle.bracketNodes.find(
      (candidate) => candidate.id === firstRoundNode.id
    );

    expect(result?.replacedIn).toBe("bracket");
    expect(result?.replacementType).toBe("bye");
    expect(completedFirstRoundNode?.racerAId).toBe("r1");
    expect(completedFirstRoundNode?.winnerRacerId).toBe("r1");
    expect(secondRoundNode?.state).toBe("bye");
    expect(secondRoundNode?.winnerRacerId).toBe("r3");
    expect([secondRoundNode?.racerAId, secondRoundNode?.racerBId]).not.toContain("r1");
    expect(result?.bundle.seeds.some((seed) => seed.racerId === "r5")).toBe(false);
  });

  it("lets an admin manually replace a racer in a later unplayed bracket slot", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const firstRoundNode = bundle.bracketNodes.find((candidate) => candidate.racerAId === "r1")!;
    const secondRoundNodeId = firstRoundNode.winnerToNodeId!;
    const progressedBundle = {
      ...bundle,
      bracketNodes: bundle.bracketNodes.map((candidate) =>
        candidate.id === firstRoundNode.id
          ? {
              ...candidate,
              state: "finished" as const,
              winnerRacerId: "r1"
            }
          : candidate.id === secondRoundNodeId
            ? {
                ...candidate,
                racerAId: "r1",
                racerBId: "r3",
                state: "ready" as const
              }
            : candidate
      )
    };

    const result = optOutTournamentRacer({
      bundle: progressedBundle,
      optedOutRacerId: "r1",
      removalReason: "admin-removed",
      replacementSeed: {
        racerId: "r5",
        label: "Emery",
        score: 0,
        seed: 5
      }
    });
    const completedFirstRoundNode = result?.bundle.bracketNodes.find(
      (candidate) => candidate.id === firstRoundNode.id
    );
    const secondRoundNode = result?.bundle.bracketNodes.find(
      (candidate) => candidate.id === secondRoundNodeId
    );

    expect(result?.replacedIn).toBe("bracket");
    expect(result?.replacementType).toBe("racer");
    expect(completedFirstRoundNode?.winnerRacerId).toBe("r1");
    expect([secondRoundNode?.racerAId, secondRoundNode?.racerBId]).toContain("r5");
    expect([secondRoundNode?.racerAId, secondRoundNode?.racerBId]).not.toContain("r1");
    expect(getTournamentAdminRemovedRacerIds(result!.bundle)).toContain("r1");
  });

  it("still allows opt-out after all of a racer's bracket matches are historical", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const node = bundle.bracketNodes.find((candidate) => candidate.racerBId === "r4")!;

    const result = optOutTournamentRacer({
      bundle: {
        ...bundle,
        bracketNodes: bundle.bracketNodes.map((candidate) =>
          candidate.id === node.id
            ? {
                ...candidate,
                state: "finished" as const,
                winnerRacerId: candidate.racerAId
              }
            : candidate
        )
      },
      optedOutRacerId: "r4",
      replacementSeed: null
    });

    expect(result?.replacedIn).toBe("none");
    expect(result?.replacementType).toBe("bye");
    expect(result?.bundle.seeds.some((seed) => seed.racerId === "r4")).toBe(false);
  });

  it("turns an unplayed first-round bracket slot into a bye when no replacement is available", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const originalNode = bundle.bracketNodes.find(
      (candidate) => candidate.racerAId === "r4" || candidate.racerBId === "r4"
    )!;
    const remainingRacerId =
      originalNode.racerAId === "r4" ? originalNode.racerBId : originalNode.racerAId;

    const result = optOutTournamentRacer({
      bundle,
      optedOutRacerId: "r4",
      replacementSeed: null
    });
    const byeNode = result?.bundle.bracketNodes.find(
      (candidate) => candidate.id === originalNode.id
    );
    const downstreamNode = result?.bundle.bracketNodes.find(
      (candidate) => candidate.id === originalNode.winnerToNodeId
    );

    expect(result?.replacedIn).toBe("bracket");
    expect(result?.replacementType).toBe("bye");
    expect(result?.bundle.seeds.some((seed) => seed.racerId === "r4")).toBe(false);
    expect(byeNode?.state).toBe("bye");
    expect(byeNode?.winnerRacerId).toBe(remainingRacerId);
    expect([byeNode?.racerAId, byeNode?.racerBId]).not.toContain("r4");
    expect([downstreamNode?.racerAId, downstreamNode?.racerBId]).toContain(remainingRacerId);
    expect(getTournamentSelfOptOutRacerIds(result!.bundle)).toContain("r4");
  });

  it("lists only racers with unfinished tournament matches", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const firstRoundNode = bundle.bracketNodes.find((candidate) => candidate.racerAId === "r1")!;
    const secondRoundNodeId = firstRoundNode.winnerToNodeId!;
    const advancingRacerId =
      firstRoundNode.racerAId === "r1" ? firstRoundNode.racerBId! : firstRoundNode.racerAId!;
    const progressedBundle = {
      ...bundle,
      bracketNodes: bundle.bracketNodes.map((candidate) =>
        candidate.id === firstRoundNode.id
          ? {
              ...candidate,
              state: "finished" as const,
              winnerRacerId: advancingRacerId
            }
          : candidate.id === secondRoundNodeId
            ? {
                ...candidate,
                racerAId: advancingRacerId,
                racerBId: "r3",
                state: "ready" as const
              }
            : candidate
      )
    };

    expect(getTournamentRacerIdsWithIncompleteMatches(progressedBundle)).toEqual(
      expect.arrayContaining([advancingRacerId, "r3"])
    );
    expect(getTournamentRacerIdsWithIncompleteMatches(progressedBundle)).not.toContain("r1");
  });

  it("fills a bracket bye slot and clears the automatic advance", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 3),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const byeNode = bundle.bracketNodes.find((candidate) => candidate.state === "bye")!;
    const downstreamNodeId = byeNode.winnerToNodeId!;

    const result = fillBracketByeSlot({
      bundle,
      nodeId: byeNode.id,
      replacementSeed: {
        racerId: "r4",
        label: "Drew",
        score: 0,
        seed: 4
      }
    });
    const filledNode = result?.bracketNodes.find((candidate) => candidate.id === byeNode.id);
    const downstreamNode = result?.bracketNodes.find(
      (candidate) => candidate.id === downstreamNodeId
    );

    expect(filledNode?.state).toBe("ready");
    expect(filledNode?.winnerRacerId).toBeNull();
    expect([filledNode?.racerAId, filledNode?.racerBId]).toContain("r4");
    expect([downstreamNode?.racerAId, downstreamNode?.racerBId]).not.toContain(
      byeNode.winnerRacerId
    );
    expect(result?.seeds.some((seed) => seed.racerId === "r4")).toBe(true);
  });

  it("blocks filling a bracket bye slot after a downstream result exists", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 3),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const byeNode = bundle.bracketNodes.find((candidate) => candidate.state === "bye")!;
    const downstreamNodeId = byeNode.winnerToNodeId!;
    const progressedBundle = {
      ...bundle,
      bracketNodes: bundle.bracketNodes.map((candidate) =>
        candidate.id === downstreamNodeId
          ? {
              ...candidate,
              state: "finished" as const,
              winnerRacerId: byeNode.winnerRacerId
            }
          : candidate
      )
    };

    expect(
      fillBracketByeSlot({
        bundle: progressedBundle,
        nodeId: byeNode.id,
        replacementSeed: {
          racerId: "r4",
          label: "Drew",
          score: 0,
          seed: 4
        }
      })
    ).toBeNull();
  });

  it("replaces an opted-out racer across unplayed round-robin matches", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Round Robin",
      preset: "round-robin"
    });

    const result = optOutTournamentRacer({
      bundle,
      optedOutRacerId: "r2",
      replacementSeed: {
        racerId: "r5",
        label: "Emery",
        score: 0,
        seed: 5
      }
    });

    expect(result?.replacedIn).toBe("matches");
    expect(result?.replacementType).toBe("racer");
    expect(result?.bundle.groupMatches.some((match) => match.racerAId === "r2")).toBe(false);
    expect(result?.bundle.groupMatches.some((match) => match.racerBId === "r2")).toBe(false);
    expect(result?.bundle.groupMatches.some((match) => match.racerAId === "r5")).toBe(true);
    expect(result?.bundle.groupMatches.some((match) => match.racerBId === "r5")).toBe(true);
  });

  it("removes unplayed round-robin matches as no-contests when no replacement is available", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Round Robin",
      preset: "round-robin"
    });

    const result = optOutTournamentRacer({
      bundle,
      optedOutRacerId: "r2",
      replacementSeed: null
    });

    expect(result?.replacedIn).toBe("matches");
    expect(result?.replacementType).toBe("bye");
    expect(result?.bundle.seeds.some((seed) => seed.racerId === "r2")).toBe(false);
    expect(result?.bundle.groupMatches.some((match) => match.racerAId === "r2")).toBe(false);
    expect(result?.bundle.groupMatches.some((match) => match.racerBId === "r2")).toBe(false);
  });

  it("keeps completed round-robin matches while removing future matches after a late opt-out", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Round Robin",
      preset: "round-robin"
    });
    const completedMatch = bundle.groupMatches.find(
      (match) => match.racerAId === "r2" || match.racerBId === "r2"
    )!;
    const bundleWithResult = {
      ...bundle,
      groupMatches: bundle.groupMatches.map((match) =>
        match.id === completedMatch.id ? { ...match, winnerRacerId: match.racerAId } : match
      )
    };

    const result = optOutTournamentRacer({
      bundle: bundleWithResult,
      optedOutRacerId: "r2",
      replacementSeed: canAutomaticallyReplaceTournamentRacer(bundleWithResult, "r2")
        ? {
            racerId: "r5",
            label: "Emery",
            score: 0,
            seed: 5
          }
        : null
    });

    expect(result?.replacedIn).toBe("matches");
    expect(result?.replacementType).toBe("bye");
    expect(result?.bundle.groupMatches).toContainEqual(
      expect.objectContaining({
        id: completedMatch.id
      })
    );
    expect(
      result?.bundle.groupMatches.filter(
        (match) =>
          match.id !== completedMatch.id && (match.racerAId === "r2" || match.racerBId === "r2")
      )
    ).toEqual([]);
    expect(result?.bundle.seeds.some((seed) => seed.racerId === "r5")).toBe(false);
  });

  it("keeps completed round-robin matches while manually replacing future matches", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Round Robin",
      preset: "round-robin"
    });
    const completedMatch = bundle.groupMatches.find(
      (match) => match.racerAId === "r2" || match.racerBId === "r2"
    )!;
    const bundleWithResult = {
      ...bundle,
      groupMatches: bundle.groupMatches.map((match) =>
        match.id === completedMatch.id ? { ...match, winnerRacerId: match.racerAId } : match
      )
    };

    const result = optOutTournamentRacer({
      bundle: bundleWithResult,
      optedOutRacerId: "r2",
      removalReason: "admin-removed",
      replacementSeed: {
        racerId: "r5",
        label: "Emery",
        score: 0,
        seed: 5
      }
    });
    const preservedMatch = result?.bundle.groupMatches.find(
      (match) => match.id === completedMatch.id
    );
    const futureMatchesWithRemovedRacer = result?.bundle.groupMatches.filter(
      (match) =>
        match.id !== completedMatch.id && (match.racerAId === "r2" || match.racerBId === "r2")
    );

    expect(result?.replacementType).toBe("racer");
    expect(preservedMatch).toEqual(
      expect.objectContaining({
        id: completedMatch.id,
        winnerRacerId: completedMatch.racerAId
      })
    );
    expect(futureMatchesWithRemovedRacer).toEqual([]);
    expect(
      result?.bundle.groupMatches.some(
        (match) => !match.winnerRacerId && (match.racerAId === "r5" || match.racerBId === "r5")
      )
    ).toBe(true);
  });

  it("undoes a bracket result when the downstream match has not completed", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const firstRoundNode = bundle.bracketNodes.find((candidate) => candidate.racerAId === "r1")!;
    const secondRoundNodeId = firstRoundNode.winnerToNodeId!;
    const progressedBundle = {
      ...bundle,
      bracketNodes: bundle.bracketNodes.map((candidate) =>
        candidate.id === firstRoundNode.id
          ? {
              ...candidate,
              state: "finished" as const,
              winnerRacerId: "r1"
            }
          : candidate.id === secondRoundNodeId
            ? {
                ...candidate,
                racerAId: "r1",
                state: "pending" as const
              }
            : candidate
      )
    };

    const result = undoBracketNodeResult({
      bundle: progressedBundle,
      nodeId: firstRoundNode.id
    });
    const sourceNode = result?.bracketNodes.find((candidate) => candidate.id === firstRoundNode.id);
    const downstreamNode = result?.bracketNodes.find(
      (candidate) => candidate.id === secondRoundNodeId
    );

    expect(sourceNode?.winnerRacerId).toBeNull();
    expect(sourceNode?.state).toBe("ready");
    expect(downstreamNode?.racerAId).toBeNull();
  });

  it("blocks bracket result undo when the downstream match already has a winner", () => {
    const service = new TournamentService();
    const bundle = service.createTournamentBundle({
      event,
      racers: racers.slice(0, 4),
      results,
      name: "Top Four",
      preset: "single-elimination",
      bracketSize: 4
    });
    const firstRoundNode = bundle.bracketNodes.find((candidate) => candidate.racerAId === "r1")!;
    const secondRoundNodeId = firstRoundNode.winnerToNodeId!;
    const progressedBundle = {
      ...bundle,
      bracketNodes: bundle.bracketNodes.map((candidate) =>
        candidate.id === firstRoundNode.id
          ? {
              ...candidate,
              state: "finished" as const,
              winnerRacerId: "r1"
            }
          : candidate.id === secondRoundNodeId
            ? {
                ...candidate,
                racerAId: "r1",
                racerBId: "r3",
                state: "finished" as const,
                winnerRacerId: "r1"
              }
            : candidate
      )
    };

    expect(
      undoBracketNodeResult({
        bundle: progressedBundle,
        nodeId: firstRoundNode.id
      })
    ).toBeNull();
  });
});
