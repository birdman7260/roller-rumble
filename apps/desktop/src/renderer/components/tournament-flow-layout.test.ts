import { describe, expect, it } from "vitest";
import type { AppSnapshot, TournamentBundle } from "@goldsprints/shared/types";
import { buildBracketFlow } from "./tournament-flow-layout";

describe("tournament flow layout", () => {
  it("labels the missing side of a completed bye as BYE", () => {
    const snapshot = {
      raceProjection: {
        race: null
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

    const flow = buildBracketFlow(snapshot, bundle, false);

    expect(flow.nodes[0]?.data.participants[0].name).toBe("Riley");
    expect(flow.nodes[0]?.data.participants[1].name).toBe("BYE");
  });
});
