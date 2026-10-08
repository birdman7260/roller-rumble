import { describe, expect, it } from "vitest";
import type { AppSnapshot, TournamentBundle } from "@roller-rumble/shared/types";
import { buildBracketFlow } from "./tournament-flow-layout";

const snapshot = {
  raceProjection: {
    race: null
  },
  settings: {
    raceDisplayLaneColorsFlipped: false
  },
  racers: [
    {
      racer: {
        id: "racer-1",
        displayName: "Riley"
      }
    }
  ]
} as AppSnapshot;

function makeBundle(nodeIds: string[]): TournamentBundle {
  return {
    tournament: {
      createdAt: "2026-01-01T00:00:00.000Z",
      eventId: "event-1",
      id: "tournament-1",
      name: "Test Bracket",
      preset: "single-elimination",
      settings: { bracketLayout: "standard" },
      status: "active",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    bracketNodes: nodeIds.map((id, index) => ({
      id,
      tournamentId: "tournament-1",
      stageId: "stage-1",
      roundNumber: 1,
      matchNumber: index + 1,
      slotLabel: `W1.${String(index + 1)}`,
      racerAId: null,
      racerBId: null,
      winnerRacerId: null,
      winnerToNodeId: null,
      loserToNodeId: null,
      state: "pending",
      meta: { bracket: "winners" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    })),
    groupMatches: [],
    seeds: [],
    stages: [],
    standings: []
  };
}

/** A one-match bracket with the given slots and state, for reading the slots' bike colours. */
function makeMatchBundle(
  node: Pick<TournamentBundle["bracketNodes"][number], "racerAId" | "racerBId" | "state"> & {
    winnerRacerId?: string | null;
  }
): TournamentBundle {
  const bundle = makeBundle(["match-1"]);
  return { ...bundle, bracketNodes: [{ ...bundle.bracketNodes[0], ...node }] };
}

function slotBikeColors(flowSnapshot: AppSnapshot, bundle: TournamentBundle) {
  return buildBracketFlow(flowSnapshot, bundle, false).nodes[0]?.data.participants.map(
    (participant) => participant.bikeColor
  );
}

describe("bracket slot bike colours", () => {
  it("colours a match still to race: slot A the left bike, slot B the right", () => {
    expect(
      slotBikeColors(
        snapshot,
        makeMatchBundle({ racerAId: "racer-1", racerBId: "racer-2", state: "ready" })
      )
    ).toEqual(["orange", "purple"]);
  });

  it("colours only the filled slot of a pending match", () => {
    expect(
      slotBikeColors(
        snapshot,
        makeMatchBundle({ racerAId: null, racerBId: "racer-2", state: "pending" })
      )
    ).toEqual([null, "purple"]);
  });

  it("leaves finished matches and byes plain", () => {
    expect(
      slotBikeColors(
        snapshot,
        makeMatchBundle({
          racerAId: "racer-1",
          racerBId: "racer-2",
          state: "finished",
          winnerRacerId: "racer-1"
        })
      )
    ).toEqual([null, null]);
    expect(
      slotBikeColors(
        snapshot,
        makeMatchBundle({
          racerAId: "racer-1",
          racerBId: null,
          state: "bye",
          winnerRacerId: "racer-1"
        })
      )
    ).toEqual([null, null]);
  });

  it("follows a lane swap on the match on the bikes", () => {
    const swappedSnapshot = {
      ...snapshot,
      raceProjection: {
        race: {
          tournamentId: "tournament-1",
          participants: [
            { racerId: "racer-2", lane: "left" },
            { racerId: "racer-1", lane: "right" }
          ]
        }
      }
    } as unknown as AppSnapshot;

    expect(
      slotBikeColors(
        swappedSnapshot,
        makeMatchBundle({ racerAId: "racer-1", racerBId: "racer-2", state: "ready" })
      )
    ).toEqual(["purple", "orange"]);
  });

  it("follows the flipped lane colours", () => {
    const flippedSnapshot = {
      ...snapshot,
      settings: { raceDisplayLaneColorsFlipped: true }
    } as AppSnapshot;

    expect(
      slotBikeColors(
        flippedSnapshot,
        makeMatchBundle({ racerAId: "racer-1", racerBId: "racer-2", state: "ready" })
      )
    ).toEqual(["purple", "orange"]);
  });
});

describe("tournament flow layout", () => {
  it("marks only the match pinned up next", () => {
    const flow = buildBracketFlow(snapshot, makeBundle(["match-1", "match-2"]), true, {
      pinnedNodeId: "match-2"
    });

    expect(flow.nodes.map((node) => [node.id, node.data.pinned])).toEqual([
      ["match-1", false],
      ["match-2", true]
    ]);
  });

  it("marks no match when nothing is pinned", () => {
    const flow = buildBracketFlow(snapshot, makeBundle(["match-1"]), false);

    expect(flow.nodes[0]?.data.pinned).toBe(false);
  });

  it("labels the missing side of a completed bye as BYE", () => {
    const byeSnapshot = {
      raceProjection: {
        race: null
      },
      settings: {
        raceDisplayLaneColorsFlipped: false
      },
      racers: [
        {
          racer: {
            id: "racer-1",
            displayName: "Riley"
          }
        }
      ]
    } as AppSnapshot;
    const bundle = {
      tournament: {
        createdAt: "2026-01-01T00:00:00.000Z",
        eventId: "event-1",
        id: "tournament-1",
        name: "Test Bracket",
        preset: "single-elimination",
        settings: {
          bracketLayout: "standard"
        },
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      bracketNodes: [
        {
          id: "match-1",
          tournamentId: "tournament-1",
          stageId: "stage-1",
          roundNumber: 1,
          matchNumber: 1,
          slotLabel: "W1.1",
          racerAId: "racer-1",
          racerBId: null,
          winnerRacerId: "racer-1",
          winnerToNodeId: null,
          loserToNodeId: null,
          state: "bye",
          meta: {
            bracket: "winners"
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      groupMatches: [],
      seeds: [
        {
          label: "Riley",
          racerId: "racer-1",
          score: 0,
          seed: 1
        }
      ],
      stages: [],
      standings: []
    } as TournamentBundle;

    const flow = buildBracketFlow(byeSnapshot, bundle, false);

    expect(flow.nodes[0]?.data.participants[0].name).toBe("Riley");
    expect(flow.nodes[0]?.data.participants[1].name).toBe("BYE");
  });
});
