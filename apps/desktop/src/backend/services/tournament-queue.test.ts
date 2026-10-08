import { describe, expect, it } from "vitest";
import type {
  EventRecord,
  RaceRecord,
  Racer,
  TournamentBracketSize,
  TournamentBundle,
  TournamentPreset
} from "@roller-rumble/shared/types";
import { TournamentService } from "./tournaments";
import { buildTournamentQueue, withPinnedUpNextMatchId } from "./tournament-queue";

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

// With no results yet, seeds follow display-name order: Avery is seed 1, Blake seed 2, and so on.
const NAMES = ["Avery", "Blake", "Casey", "Drew", "Emery", "Finley", "Gray", "Harper"];

function makeRacers(count: number): Racer[] {
  return NAMES.slice(0, count).map((displayName, index) => ({
    id: `r${String(index + 1)}`,
    displayName,
    avatarUrl: null,
    createdAt: "x",
    updatedAt: "x",
    realName: null,
    email: null,
    phone: null
  }));
}

function createBundle(
  preset: TournamentPreset,
  racerCount: number,
  bracketSize?: TournamentBracketSize
): TournamentBundle {
  return new TournamentService().createTournamentBundle({
    event,
    racers: makeRacers(racerCount),
    results: [],
    name: "Bracket Night",
    preset,
    bracketSize
  });
}

describe("buildTournamentQueue", () => {
  it("lists a fresh single-elimination bracket round by round", () => {
    const bundle = createBundle("single-elimination", 4);

    const queue = buildTournamentQueue({ bundle, currentRace: null });

    expect(
      queue.map((entry) => ({
        position: entry.position,
        racerIds: entry.racerIds,
        roundLabel: entry.roundLabel,
        status: entry.status
      }))
    ).toEqual([
      { position: 1, racerIds: ["r1", "r4"], roundLabel: "Round 1", status: "ready" },
      { position: 2, racerIds: ["r2", "r3"], roundLabel: "Round 1", status: "ready" },
      { position: 3, racerIds: [null, null], roundLabel: "Round 2", status: "waiting" }
    ]);
  });

  it("drops byes, so a racer with a free pass waits in the next round", () => {
    const bundle = createBundle("single-elimination", 3, 4);

    const queue = buildTournamentQueue({ bundle, currentRace: null });

    expect(queue.map((entry) => [entry.racerIds, entry.status])).toEqual([
      [["r2", "r3"], "ready"],
      [["r1", null], "waiting"]
    ]);
  });

  it("interleaves double-elimination losers rounds with the winners rounds that feed them", () => {
    const bundle = createBundle("double-elimination", 8);

    const queue = buildTournamentQueue({ bundle, currentRace: null });

    // Each losers round races as soon as the winners round dropping riders into it is done, and
    // the reset final stays out of the queue until the grand final calls for it.
    expect(queue.map((entry) => entry.roundLabel)).toEqual([
      "Winners 1",
      "Winners 1",
      "Winners 1",
      "Winners 1",
      "Losers 1",
      "Losers 1",
      "Winners 2",
      "Winners 2",
      "Losers 2",
      "Losers 2",
      "Losers 3",
      "Losers 3",
      "Winners 3",
      "Losers 4",
      "Grand Final"
    ]);
  });

  it("spaces round-robin races so riders rest between them", () => {
    const bundle = createBundle("round-robin", 4);

    const queue = buildTournamentQueue({ bundle, currentRace: null });

    expect(queue.map((entry) => entry.racerIds)).toEqual([
      ["r1", "r2"],
      ["r3", "r4"],
      ["r1", "r3"],
      ["r2", "r4"],
      ["r1", "r4"],
      ["r2", "r3"]
    ]);
    expect(queue.every((entry) => entry.status === "ready")).toBe(true);
  });

  it("never puts a round-robin rider on the bikes twice in a row when the field allows it", () => {
    const bundle = createBundle("round-robin", 6);

    const queue = buildTournamentQueue({ bundle, currentRace: null });

    expect(queue).toHaveLength(15);
    for (let index = 1; index < queue.length; index += 1) {
      const previous = queue[index - 1].racerIds;
      expect(queue[index].racerIds.some((racerId) => previous.includes(racerId))).toBe(false);
    }
  });

  it("races the group stage before the finals, whose slots wait on the group standings", () => {
    const bundle = createBundle("groups-to-single-elimination", 8);

    const queue = buildTournamentQueue({ bundle, currentRace: null });

    const groupEntries = queue.slice(0, 12);
    const finalsEntries = queue.slice(12);
    expect(groupEntries.every((entry) => entry.matchKind === "group")).toBe(true);
    expect(groupEntries[0].roundLabel).toBe("Group A");
    expect(groupEntries[1].roundLabel).toBe("Group B");
    expect(finalsEntries.map((entry) => [entry.roundLabel, entry.racerIds, entry.status])).toEqual([
      ["Finals 1", [null, null], "waiting"],
      ["Finals 1", [null, null], "waiting"],
      ["Finals 2", [null, null], "waiting"]
    ]);
  });

  it("keeps the finals undecided until the whole group stage is raced", () => {
    const bundle = createBundle("groups-to-single-elimination", 8);
    // Mid-group-stage the finals already hold the current standings leaders, provisionally.
    const leaders = bundle.seeds.map((seed) => seed.racerId);
    const midGroupStage: TournamentBundle = {
      ...bundle,
      groupMatches: bundle.groupMatches.map((match, index) =>
        index === 0 ? { ...match, winnerRacerId: match.racerAId } : match
      ),
      bracketNodes: bundle.bracketNodes.map((node) =>
        node.roundNumber === 1
          ? {
              ...node,
              racerAId: leaders[node.matchNumber - 1],
              racerBId: leaders[node.matchNumber + 1],
              state: "ready"
            }
          : node
      )
    };

    const queue = buildTournamentQueue({ bundle: midGroupStage, currentRace: null });

    expect(
      queue
        .filter((entry) => entry.matchKind === "bracket")
        .map((entry) => [entry.racerIds, entry.status])
    ).toEqual([
      [[null, null], "waiting"],
      [[null, null], "waiting"],
      [[null, null], "waiting"]
    ]);
  });

  describe("around the current race and the host's pick", () => {
    function raceFor(
      bundle: TournamentBundle,
      racerIds: [string, string],
      state: RaceRecord["state"]
    ): RaceRecord {
      return {
        id: "race-1",
        eventId: event.id,
        tournamentId: bundle.tournament.id,
        stageId: bundle.stages[0].id,
        queueEntryId: null,
        mode: bundle.tournament.preset,
        format: "match",
        themeId: "neon-night",
        targetDistanceMeters: 250,
        participants: [
          { racerId: racerIds[0], lane: "left" },
          { racerId: racerIds[1], lane: "right" }
        ],
        state,
        metrics: [],
        winnerRacerId: null,
        startedAt: null,
        finishedAt: null,
        createdAt: "x",
        updatedAt: "x"
      };
    }

    it("puts the staged match first, wherever the bracket had it", () => {
      const bundle = createBundle("single-elimination", 4);

      const queue = buildTournamentQueue({
        bundle,
        currentRace: raceFor(bundle, ["r3", "r2"], "staging")
      });

      expect(queue.map((entry) => [entry.position, entry.racerIds, entry.status])).toEqual([
        [1, ["r2", "r3"], "staging"],
        [2, ["r1", "r4"], "ready"],
        [3, [null, null], "waiting"]
      ]);
    });

    it("drops the match once its race is on the bikes", () => {
      const bundle = createBundle("single-elimination", 4);

      const queue = buildTournamentQueue({
        bundle,
        currentRace: raceFor(bundle, ["r1", "r4"], "active")
      });

      expect(queue.map((entry) => entry.racerIds)).toEqual([
        ["r2", "r3"],
        [null, null]
      ]);
    });

    it("moves the pinned match up next, behind only the staged one", () => {
      const bundle = createBundle("round-robin", 4);
      const [first, second, , , , last] = buildTournamentQueue({ bundle, currentRace: null });

      const queue = buildTournamentQueue({
        bundle: withPinnedUpNextMatchId(bundle, last.matchId, "x"),
        currentRace: raceFor(bundle, ["r3", "r4"], "staging")
      });

      expect(queue.slice(0, 3).map((entry) => [entry.matchId, entry.pinnedUpNext])).toEqual([
        [second.matchId, false],
        [last.matchId, true],
        [first.matchId, false]
      ]);
    });

    it("ignores a pin on a match that can't race yet", () => {
      const bundle = createBundle("single-elimination", 4);
      const final = buildTournamentQueue({ bundle, currentRace: null })[2];

      const queue = buildTournamentQueue({
        bundle: withPinnedUpNextMatchId(bundle, final.matchId, "x"),
        currentRace: null
      });

      expect(queue.map((entry) => entry.matchId).at(-1)).toBe(final.matchId);
      expect(queue.some((entry) => entry.pinnedUpNext)).toBe(false);
    });
  });
});
