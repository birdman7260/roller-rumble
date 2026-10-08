import type { QueueEntry, TopRacersEntry } from "@roller-rumble/shared/types";
import { describe, expect, it } from "vitest";
import { getProjectorIdleView } from "./projector-idle-view";

const queuedRace = { id: "entry-1" } as QueueEntry;
const boardRow: TopRacersEntry = { racerId: "ana", raceId: "race-1", finishTimeMs: 30_000 };

describe("getProjectorIdleView", () => {
  it("shows the full signup prompt before anyone has queued or raced", () => {
    expect(getProjectorIdleView({ queue: [], topRacers: [] })).toBe("signup-prompt");
  });

  it("shows the queue beside the top racers board once both have something on them", () => {
    expect(getProjectorIdleView({ queue: [queuedRace], topRacers: [boardRow] })).toBe(
      "queue-and-top-racers"
    );
  });

  it("swaps the empty queue for a compact signup prompt beside the board", () => {
    expect(getProjectorIdleView({ queue: [], topRacers: [boardRow] })).toBe(
      "signup-and-top-racers"
    );
  });

  it("keeps a compact signup prompt beside the queue until someone posts a time", () => {
    expect(getProjectorIdleView({ queue: [queuedRace], topRacers: [] })).toBe("queue-and-signup");
  });
});
