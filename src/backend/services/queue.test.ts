import { describe, expect, it } from "vitest";
import type { QueueEntry } from "../../shared/types";
import {
  addQueueSignup,
  findNextQueuedEntry,
  removeRacerFromQueue,
  removeRacerFromSpecificQueueEntry
} from "./queue";

const baseEntries: QueueEntry[] = [
  {
    id: "q1",
    eventId: "e1",
    type: "solo",
    requestedType: "auto-match",
    position: 1,
    racerIds: ["r1"],
    status: "queued",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  },
  {
    id: "q2",
    eventId: "e1",
    type: "match",
    requestedType: "match",
    position: 2,
    racerIds: ["r2", "r3"],
    status: "queued",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  },
  {
    id: "q3",
    eventId: "e1",
    type: "solo",
    requestedType: "solo",
    position: 3,
    racerIds: ["r4"],
    status: "queued",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  }
];

const compactingEntries: QueueEntry[] = [
  {
    id: "c1",
    eventId: "e1",
    type: "match",
    requestedType: "auto-match",
    position: 1,
    racerIds: ["r1", "r2"],
    status: "queued",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  },
  {
    id: "c2",
    eventId: "e1",
    type: "match",
    requestedType: "auto-match",
    position: 2,
    racerIds: ["r3", "r4"],
    status: "queued",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  },
  {
    id: "c3",
    eventId: "e1",
    type: "match",
    requestedType: "match",
    position: 3,
    racerIds: ["r5", "r6"],
    status: "queued",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  },
  {
    id: "c4",
    eventId: "e1",
    type: "match",
    requestedType: "auto-match",
    position: 4,
    racerIds: ["r7", "r8"],
    status: "queued",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  }
];

describe("queue service", () => {
  it("pairs a single auto-match signup with the earliest waiting racer", () => {
    const updated = addQueueSignup(baseEntries, {
      eventId: "e1",
      racerId: "r5",
      requestedType: "auto-match",
      entryId: "q4",
      timestamp: "2025-01-01T00:00:01.000Z"
    });
    const paired = updated.find((entry) => entry.id === "q1");
    expect(paired?.type).toBe("match");
    expect(paired?.requestedType).toBe("auto-match");
    expect(paired?.racerIds).toEqual(["r1", "r5"]);
    expect(updated).toHaveLength(3);
  });

  it("stores an unmatched auto-match signup as waiting and keeps it out of staging order", () => {
    const updated = addQueueSignup([], {
      eventId: "e1",
      racerId: "r1",
      requestedType: "auto-match",
      entryId: "q1",
      timestamp: "2025-01-01T00:00:01.000Z"
    });
    expect(updated[0]?.type).toBe("solo");
    expect(updated[0]?.requestedType).toBe("auto-match");
    expect(findNextQueuedEntry(updated)).toBeNull();
  });

  it("removes a racer from all upcoming queue entries and reindexes the list", () => {
    const updated = removeRacerFromQueue(baseEntries, "r1");
    expect(updated).toHaveLength(2);
    expect(updated[0].id).toBe("q2");
    expect(updated[0].position).toBe(1);
    expect(updated[1].id).toBe("q3");
    expect(updated[1].position).toBe(2);
  });

  it("reflows a broken explicit match through earlier auto-match slots before keeping later solo runs", () => {
    const updated = removeRacerFromSpecificQueueEntry(baseEntries, "q2", "r2");

    expect(updated[0]).toMatchObject({
      id: "q1",
      type: "match",
      requestedType: "auto-match",
      racerIds: ["r1", "r3"],
      position: 1
    });
    expect(updated[1]).toMatchObject({
      id: "q2",
      type: "solo",
      requestedType: "solo",
      racerIds: ["r4"],
      position: 2
    });
  });

  it("shifts later auto-matched riders up to fill a removed slot without breaking explicit matches", () => {
    const updated = removeRacerFromSpecificQueueEntry(compactingEntries, "c1", "r2");

    expect(updated).toHaveLength(4);
    expect(updated[0]).toMatchObject({
      id: "c1",
      type: "match",
      requestedType: "auto-match",
      racerIds: ["r1", "r3"],
      position: 1
    });
    expect(updated[1]).toMatchObject({
      id: "c2",
      type: "solo",
      requestedType: "auto-match",
      racerIds: ["r4"],
      position: 2
    });
    expect(updated[2]).toMatchObject({
      id: "c3",
      type: "match",
      requestedType: "match",
      racerIds: ["r5", "r6"],
      position: 3
    });
    expect(updated[3]).toMatchObject({
      id: "c4",
      type: "match",
      requestedType: "auto-match",
      racerIds: ["r7", "r8"],
      position: 4
    });
  });
});
