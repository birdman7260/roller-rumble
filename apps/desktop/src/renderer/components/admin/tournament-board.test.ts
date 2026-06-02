import { describe, expect, it } from "vitest";
import type { BracketNode, TournamentBundle } from "@goldsprints/shared/types";
import {
  canFillByeNode,
  canRemoveRacerFromBracketNode,
  canUndoBracketNodeResult
} from "./tournament-board-actions";

const now = "2026-01-01T00:00:00.000Z";

function bracketNode(input: Partial<BracketNode> & Pick<BracketNode, "id">): BracketNode {
  return {
    tournamentId: "tournament-1",
    stageId: "stage-1",
    roundNumber: 1,
    matchNumber: 1,
    slotLabel: input.id,
    racerAId: null,
    racerBId: null,
    winnerRacerId: null,
    loserToNodeId: null,
    winnerToNodeId: null,
    state: "pending",
    meta: {},
    createdAt: now,
    updatedAt: now,
    ...input,
    id: input.id
  };
}

function tournamentBundle(nodes: BracketNode[]): TournamentBundle {
  return {
    tournament: {
      id: "tournament-1",
      eventId: "event-1",
      name: "Test Tournament",
      preset: "single-elimination",
      status: "active",
      settings: {},
      createdAt: now,
      updatedAt: now
    },
    stages: [],
    bracketNodes: nodes,
    groupMatches: [],
    standings: [],
    seeds: []
  };
}

describe("tournament bracket menu eligibility", () => {
  it("allows undo for a completed bracket result only before downstream results exist", () => {
    const source = bracketNode({
      id: "round-1",
      racerAId: "racer-1",
      racerBId: "racer-2",
      winnerRacerId: "racer-1",
      winnerToNodeId: "final",
      loserToNodeId: "consolation",
      state: "finished"
    });
    const bundle = tournamentBundle([
      source,
      bracketNode({
        id: "final",
        racerAId: "racer-1",
        state: "pending"
      }),
      bracketNode({
        id: "consolation",
        racerAId: "racer-2",
        state: "pending"
      })
    ]);

    expect(canUndoBracketNodeResult(bundle, source)).toBe(true);

    const lockedBundle = tournamentBundle([
      source,
      bracketNode({
        id: "final",
        racerAId: "racer-1",
        racerBId: "racer-3",
        winnerRacerId: "racer-3",
        state: "finished"
      })
    ]);

    expect(canUndoBracketNodeResult(lockedBundle, source)).toBe(false);
  });

  it("does not offer racer removal from old completed matches", () => {
    const completedMatch = bracketNode({
      id: "round-1",
      racerAId: "racer-1",
      racerBId: "racer-2",
      winnerRacerId: "racer-1",
      winnerToNodeId: "final",
      state: "finished"
    });
    const futureMatch = bracketNode({
      id: "final",
      racerAId: "racer-1",
      racerBId: "racer-3",
      state: "ready"
    });
    const bundle = tournamentBundle([completedMatch, futureMatch]);

    expect(canRemoveRacerFromBracketNode(bundle, completedMatch, "racer-1")).toBe(false);
    expect(canRemoveRacerFromBracketNode(bundle, futureMatch, "racer-1")).toBe(true);
  });

  it("only allows filling a BYE while the advanced racer has no downstream result", () => {
    const byeMatch = bracketNode({
      id: "bye-match",
      racerAId: "racer-1",
      winnerRacerId: "racer-1",
      winnerToNodeId: "final",
      state: "bye"
    });
    const bundle = tournamentBundle([
      byeMatch,
      bracketNode({
        id: "final",
        racerAId: "racer-1",
        state: "pending"
      })
    ]);

    expect(canFillByeNode(bundle, byeMatch)).toBe(true);

    const lockedBundle = tournamentBundle([
      byeMatch,
      bracketNode({
        id: "final",
        racerAId: "racer-1",
        racerBId: "racer-2",
        winnerRacerId: "racer-1",
        state: "finished"
      })
    ]);

    expect(canFillByeNode(lockedBundle, byeMatch)).toBe(false);
  });
});
