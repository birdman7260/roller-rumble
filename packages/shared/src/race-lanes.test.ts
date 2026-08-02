import { describe, expect, it } from "vitest";
import type { RaceParticipant, RaceRecord } from "./types";
import { canSwapRaceLanes, oppositeBikeLane, swapParticipantLanes, toBikeLane } from "./race-lanes";

function raceInState(state: RaceRecord["state"]): Pick<RaceRecord, "state"> {
  return { state };
}

describe("toBikeLane", () => {
  it("passes a real bike lane straight through", () => {
    expect(toBikeLane("left")).toBe("left");
    expect(toBikeLane("right")).toBe("right");
  });

  it("counts a legacy solo lane as the left bike", () => {
    // The same assumption the sensor's default lane map makes, so the app has one answer.
    expect(toBikeLane("solo")).toBe("left");
  });
});

describe("canSwapRaceLanes", () => {
  it("allows a swap while the race is still waiting to start", () => {
    expect(canSwapRaceLanes(raceInState("scheduled"))).toBe(true);
    expect(canSwapRaceLanes(raceInState("staging"))).toBe(true);
  });

  it("refuses once the race is counting down or under way", () => {
    // From countdown on, the box may already be armed against the old lane map and an active race
    // has ticks banked per lane; the host resets the race to staged instead.
    expect(canSwapRaceLanes(raceInState("countdown"))).toBe(false);
    expect(canSwapRaceLanes(raceInState("active"))).toBe(false);
    expect(canSwapRaceLanes(raceInState("interrupted"))).toBe(false);
    expect(canSwapRaceLanes(raceInState("finished"))).toBe(false);
  });

  it("has nothing to swap with no race staged", () => {
    expect(canSwapRaceLanes(null)).toBe(false);
  });
});

describe("oppositeBikeLane", () => {
  it("pairs the two bikes", () => {
    expect(oppositeBikeLane("left")).toBe("right");
    expect(oppositeBikeLane("right")).toBe("left");
  });

  it("sends a legacy solo lane to the right bike", () => {
    // Races staged before the lane swap existed carry lane:"solo", which names no bike. Treating it
    // as the left bike makes its swap land on the right one instead of nowhere.
    expect(oppositeBikeLane("solo")).toBe("right");
  });
});

describe("swapParticipantLanes", () => {
  it("exchanges the two racers in a head-to-head race", () => {
    const participants: RaceParticipant[] = [
      { racerId: "ava", lane: "left" },
      { racerId: "bo", lane: "right" }
    ];

    expect(swapParticipantLanes(participants)).toEqual([
      { racerId: "bo", lane: "left" },
      { racerId: "ava", lane: "right" }
    ]);
  });

  it("keeps participants ordered left-then-right so positional consumers stay honest", () => {
    const participants: RaceParticipant[] = [
      { racerId: "ava", lane: "left" },
      { racerId: "bo", lane: "right" }
    ];

    const swapped = swapParticipantLanes(participants);

    expect(swapped.map((participant) => participant.lane)).toEqual(["left", "right"]);
  });

  it("moves a solo racer to the other bike", () => {
    expect(swapParticipantLanes([{ racerId: "ava", lane: "left" }])).toEqual([
      { racerId: "ava", lane: "right" }
    ]);
    expect(swapParticipantLanes([{ racerId: "ava", lane: "right" }])).toEqual([
      { racerId: "ava", lane: "left" }
    ]);
  });

  it("moves a legacy solo-lane racer onto a real bike", () => {
    expect(swapParticipantLanes([{ racerId: "ava", lane: "solo" }])).toEqual([
      { racerId: "ava", lane: "right" }
    ]);
  });

  it("returns to the original assignment when applied twice", () => {
    const participants: RaceParticipant[] = [
      { racerId: "ava", lane: "left" },
      { racerId: "bo", lane: "right" }
    ];

    expect(swapParticipantLanes(swapParticipantLanes(participants))).toEqual(participants);
  });

  it("leaves the input array untouched", () => {
    const participants: RaceParticipant[] = [
      { racerId: "ava", lane: "left" },
      { racerId: "bo", lane: "right" }
    ];

    swapParticipantLanes(participants);

    expect(participants).toEqual([
      { racerId: "ava", lane: "left" },
      { racerId: "bo", lane: "right" }
    ]);
  });

  it("has nothing to swap for an empty lineup", () => {
    expect(swapParticipantLanes([])).toEqual([]);
  });
});
