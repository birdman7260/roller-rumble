import { describe, expect, it } from "vitest";
import type { AppSnapshot, RaceRecord } from "@roller-rumble/shared/types";
import {
  bikeColorForLane,
  racerBikeColors,
  queueEntryBikeColors,
  tournamentEntryBikeColors
} from "./bike-colors";

function stagedRace(participants: RaceRecord["participants"]): RaceRecord {
  return { participants } as RaceRecord;
}

describe("bikeColorForLane", () => {
  it("puts the left bike in orange and the right bike in purple", () => {
    expect(bikeColorForLane("left", false)).toBe("orange");
    expect(bikeColorForLane("right", false)).toBe("purple");
  });

  it("follows the projector's flipped lane colours", () => {
    expect(bikeColorForLane("left", true)).toBe("purple");
    expect(bikeColorForLane("right", true)).toBe("orange");
  });

  it("treats a legacy solo lane as the left bike", () => {
    expect(bikeColorForLane("solo", false)).toBe("orange");
  });
});

describe("racerBikeColors", () => {
  it("seats an unstaged race in staging order: first racer left, second right", () => {
    expect(racerBikeColors(["ana", "ben"], null, false)).toEqual(["orange", "purple"]);
  });

  it("puts a lone racer on the left bike", () => {
    expect(racerBikeColors(["ana"], null, false)).toEqual(["orange"]);
  });

  it("leaves a slot nobody fills uncoloured", () => {
    expect(racerBikeColors(["ana", null], null, false)).toEqual(["orange", null]);
    expect(racerBikeColors([null, "ben"], null, false)).toEqual([null, "purple"]);
  });

  it("uses the staged race's bikes so a lane swap shows", () => {
    const swapped = stagedRace([
      { racerId: "ben", lane: "left" },
      { racerId: "ana", lane: "right" }
    ]);
    expect(racerBikeColors(["ana", "ben"], swapped, false)).toEqual(["purple", "orange"]);
  });

  it("shows a swapped solo racer on the right bike", () => {
    const swapped = stagedRace([{ racerId: "ana", lane: "right" }]);
    expect(racerBikeColors(["ana"], swapped, false)).toEqual(["purple"]);
  });

  it("applies the flipped lane colours to every racer", () => {
    expect(racerBikeColors(["ana", "ben"], null, true)).toEqual(["purple", "orange"]);
  });
});

function snapshotWith(race: Partial<RaceRecord> | null, laneColorsFlipped = false): AppSnapshot {
  return {
    raceProjection: { race },
    settings: { raceDisplayLaneColorsFlipped: laneColorsFlipped }
  } as unknown as AppSnapshot;
}

const swappedRace = {
  queueEntryId: "entry-1",
  tournamentId: "tourney-1",
  participants: [
    { racerId: "ben", lane: "left" },
    { racerId: "ana", lane: "right" }
  ]
} satisfies Partial<RaceRecord>;

describe("queueEntryBikeColors", () => {
  it("shows the swap on the queue entry the staged race came from", () => {
    expect(
      queueEntryBikeColors(snapshotWith(swappedRace), { id: "entry-1", racerIds: ["ana", "ben"] })
    ).toEqual(["purple", "orange"]);
  });

  it("ignores the staged race on any other entry with the same racers", () => {
    expect(
      queueEntryBikeColors(snapshotWith(swappedRace), { id: "entry-2", racerIds: ["ana", "ben"] })
    ).toEqual(["orange", "purple"]);
  });

  it("follows the flipped lane colours", () => {
    expect(
      queueEntryBikeColors(snapshotWith(null, true), { id: "entry-2", racerIds: ["ana", "ben"] })
    ).toEqual(["purple", "orange"]);
  });
});

describe("tournamentEntryBikeColors", () => {
  it("shows the swap on the tourney race that is staged", () => {
    expect(
      tournamentEntryBikeColors(snapshotWith(swappedRace), {
        tournamentId: "tourney-1",
        racerIds: ["ana", "ben"],
        status: "staging"
      })
    ).toEqual(["purple", "orange"]);
  });

  it("gives a tourney race that isn't staged its bracket slots: slot A left, slot B right", () => {
    expect(
      tournamentEntryBikeColors(snapshotWith(swappedRace), {
        tournamentId: "tourney-1",
        racerIds: ["ana", "ben"],
        status: "ready"
      })
    ).toEqual(["orange", "purple"]);
  });
});
