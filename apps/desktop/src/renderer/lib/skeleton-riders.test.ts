import { describe, expect, it } from "vitest";
import { swapParticipantLanes } from "@roller-rumble/shared/race-lanes";
import type { RaceParticipant } from "@roller-rumble/shared/types";
import { bikeColorForLane } from "./bike-colors";
import { getSkeletonRiderCycleMs, getSkeletonRiderSheetUrl } from "./skeleton-riders";

describe("getSkeletonRiderSheetUrl", () => {
  it("gives orange bikes the orange skeleton and purple bikes the purple one", () => {
    expect(getSkeletonRiderSheetUrl("orange")).toContain("skeleton-orange");
    expect(getSkeletonRiderSheetUrl("purple")).toContain("skeleton-purple");
  });

  it("follows the rider to the other bike when lanes are swapped", () => {
    const lineup: RaceParticipant[] = [
      { lane: "left", racerId: "ava" },
      { lane: "right", racerId: "bo" }
    ];
    const sheetFor = (participants: RaceParticipant[], racerId: string, flipped: boolean) => {
      const participant = participants.find((entry) => entry.racerId === racerId);
      if (!participant) {
        throw new Error(`no participant ${racerId}`);
      }
      return getSkeletonRiderSheetUrl(bikeColorForLane(participant.lane, flipped));
    };

    expect(sheetFor(lineup, "ava", false)).toContain("skeleton-orange");

    const swapped = swapParticipantLanes(lineup);
    expect(sheetFor(swapped, "ava", false)).toContain("skeleton-purple");
    expect(sheetFor(swapped, "bo", false)).toContain("skeleton-orange");
  });

  it("follows the projector's flipped lane colours", () => {
    expect(getSkeletonRiderSheetUrl(bikeColorForLane("left", true))).toContain("skeleton-purple");
  });
});

describe("getSkeletonRiderCycleMs", () => {
  it("keeps the themed per-frame pace across nine frames, so speed still sets the cadence", () => {
    // Themed slow: 760ms over 4 frames (190ms each) → 9 frames at that pace is 1710ms.
    expect(getSkeletonRiderCycleMs({ durationMs: 760, frameCount: 4 })).toBeCloseTo(1710, 5);
    // Themed fast: 360ms over 4 frames (90ms each) → 810ms.
    expect(getSkeletonRiderCycleMs({ durationMs: 360, frameCount: 4 })).toBeCloseTo(810, 5);
  });
});
