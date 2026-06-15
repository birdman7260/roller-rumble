import { describe, expect, it } from "vitest";
import type { QueueEntry, QueueOccurrence } from "@roller-rumble/shared/types";
import {
  addQueueSignup,
  ChallengeReplacementRequiredError,
  ChallengeTargetUnavailableError,
  findNextQueuedEntry,
  projectQueueEntries,
  removeRacerFromQueue,
  removeRacerFromSpecificQueueEntry
} from "./queue";

const timestamp = "2025-01-01T00:00:00.000Z";

function occurrence(
  id: string,
  racerId: string,
  overrides: Partial<QueueOccurrence> = {}
): QueueOccurrence {
  return {
    id,
    eventId: "e1",
    racerId,
    status: "queued",
    intent: "auto-match",
    lockGroupId: null,
    signupSequence: Number(id.replace(/\D/gu, "")) || 1,
    bumpCount: 0,
    raceCountAtJoin: 0,
    projectedPosition: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function entry(
  id: string,
  occurrenceIds: string[],
  racerIds: string[],
  overrides: Partial<QueueEntry> = {}
): QueueEntry {
  return {
    id,
    eventId: "e1",
    type: racerIds.length > 1 ? "match" : "solo",
    requestedType: "auto-match",
    lockType: "flex",
    position: Number(id.replace(/\D/gu, "")) || 1,
    racerIds,
    occurrenceIds,
    priorityScore: 0,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function project(
  occurrences: QueueOccurrence[],
  entries: QueueEntry[] = [],
  raceCounts: Record<string, number> = {}
) {
  let nextId = 1;
  return projectQueueEntries({
    entries,
    occurrences,
    eventId: "e1",
    timestamp,
    getEntryId: () => `q${String(nextId++)}`,
    racerStatsById: new Map(
      Object.entries(raceCounts).map(([racerId, raceCount]) => [racerId, { raceCount }])
    )
  });
}

describe("queue service", () => {
  it("projects auto-match signups into head-to-head races", () => {
    const result = project([occurrence("o1", "r1"), occurrence("o2", "r2")]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      type: "match",
      requestedType: "auto-match",
      lockType: "flex",
      racerIds: ["r1", "r2"],
      occurrenceIds: ["o1", "o2"]
    });
  });

  it("does not auto-match two occurrences from the same racer", () => {
    const result = project([
      occurrence("o1", "r1"),
      occurrence("o2", "r1"),
      occurrence("o3", "r2")
    ]);

    expect(result.entries[0]).toMatchObject({
      type: "match",
      racerIds: ["r1", "r2"],
      occurrenceIds: ["o1", "o3"]
    });
    expect(result.entries[1]).toMatchObject({
      type: "solo",
      requestedType: "auto-match",
      racerIds: ["r1"],
      occurrenceIds: ["o2"]
    });
  });

  it("leaves repeated signups waiting when no different racer is available", () => {
    const result = project([occurrence("o1", "r1"), occurrence("o2", "r1")]);

    expect(result.entries).toHaveLength(2);
    expect(result.entries.flatMap((candidate) => candidate.racerIds)).toEqual(["r1", "r1"]);
    expect(result.entries.every((candidate) => candidate.type === "solo")).toBe(true);
  });

  it("keeps a single auto-match signup out of staging order", () => {
    const result = project([occurrence("o1", "r1")]);

    expect(result.entries[0]).toMatchObject({
      type: "solo",
      requestedType: "auto-match",
      racerIds: ["r1"]
    });
    expect(findNextQueuedEntry(result.entries)).toBeNull();
  });

  it("inserts new racers ahead of lower-priority racers outside the protected first three races", () => {
    const existing = Array.from({ length: 8 }, (_value, index) =>
      occurrence(`o${String(index + 1)}`, `r${String(index + 1)}`, {
        projectedPosition: index + 1,
        raceCountAtJoin: 2
      })
    );
    const withFirstNewRacer = addQueueSignup(existing, {
      eventId: "e1",
      racerId: "r9",
      occurrenceId: "o9",
      timestamp,
      signupSequence: 9,
      raceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const withSecondNewRacer = addQueueSignup(withFirstNewRacer, {
      eventId: "e1",
      racerId: "r10",
      occurrenceId: "o10",
      timestamp,
      signupSequence: 10,
      raceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(withSecondNewRacer);

    expect(result.entries.slice(0, 3).map((candidate) => candidate.racerIds)).toEqual([
      ["r1", "r2"],
      ["r3", "r4"],
      ["r5", "r6"]
    ]);
    expect(result.entries[3].racerIds).toEqual(["r9", "r10"]);
    expect(result.entries[4].racerIds).toEqual(["r7", "r8"]);
  });

  it("increments bump counts for slots pushed back by a new insertion", () => {
    const existing = Array.from({ length: 8 }, (_value, index) =>
      occurrence(`o${String(index + 1)}`, `r${String(index + 1)}`, {
        projectedPosition: index + 1,
        raceCountAtJoin: 2
      })
    );
    const updated = addQueueSignup(existing, {
      eventId: "e1",
      racerId: "r9",
      occurrenceId: "o9",
      timestamp,
      signupSequence: 9,
      raceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });

    expect(updated.find((candidate) => candidate.id === "o1")?.bumpCount).toBe(0);
    expect(updated.find((candidate) => candidate.id === "o6")?.bumpCount).toBe(0);
    expect(updated.find((candidate) => candidate.id === "o7")?.bumpCount).toBe(1);
    expect(updated.find((candidate) => candidate.id === "o8")?.bumpCount).toBe(1);
  });

  it("eventually places new racers after racers who have been bumped enough", () => {
    const existing = Array.from({ length: 8 }, (_value, index) =>
      occurrence(`o${String(index + 1)}`, `r${String(index + 1)}`, {
        bumpCount: index >= 6 ? 4 : 0,
        projectedPosition: index + 1,
        raceCountAtJoin: index >= 6 ? 1 : 2
      })
    );
    const updated = addQueueSignup(existing, {
      eventId: "e1",
      racerId: "r9",
      occurrenceId: "o9",
      timestamp,
      signupSequence: 9,
      raceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(updated);

    expect(result.entries[3].racerIds).toEqual(["r7", "r8"]);
    expect(result.entries[4].racerIds).toEqual(["r9"]);
  });

  it("does not split challenge matches when filling a gap ahead of them", () => {
    const entries = [
      entry("q1", ["o1", "o2"], ["r1", "r2"]),
      entry("q2", ["o3", "o4"], ["r3", "r4"], {
        requestedType: "match",
        lockType: "challenge"
      }),
      entry("q3", ["o5", "o6"], ["r5", "r6"])
    ];
    const occurrences = [
      occurrence("o1", "r1", { projectedPosition: 1 }),
      occurrence("o2", "r2", { projectedPosition: 1 }),
      occurrence("o3", "r3", {
        intent: "challenge",
        lockGroupId: "lock-1",
        projectedPosition: 2
      }),
      occurrence("o4", "r4", {
        intent: "challenge",
        lockGroupId: "lock-1",
        projectedPosition: 2
      }),
      occurrence("o5", "r5", { projectedPosition: 3 }),
      occurrence("o6", "r6", { projectedPosition: 3 })
    ];

    const removed = removeRacerFromSpecificQueueEntry(entries, occurrences, "q1", "r2");
    const result = project(removed, entries);

    expect(result.entries[0]).toMatchObject({
      racerIds: ["r1", "r5"],
      requestedType: "auto-match"
    });
    expect(result.entries[1]).toMatchObject({
      racerIds: ["r3", "r4"],
      requestedType: "match",
      lockType: "challenge"
    });
    expect(result.entries[2]).toMatchObject({
      racerIds: ["r6"],
      requestedType: "auto-match"
    });
  });

  it("protects the first three derived races when inserting a new high-priority racer", () => {
    const occurrences = [
      occurrence("o1", "r1", { projectedPosition: 1, raceCountAtJoin: 5 }),
      occurrence("o2", "r2", {
        intent: "challenge",
        lockGroupId: "lock-1",
        projectedPosition: 2,
        raceCountAtJoin: 5
      }),
      occurrence("o3", "r3", {
        intent: "challenge",
        lockGroupId: "lock-1",
        projectedPosition: 2,
        raceCountAtJoin: 5
      }),
      occurrence("o4", "r4", { projectedPosition: 3, raceCountAtJoin: 5 }),
      occurrence("o5", "r5", { projectedPosition: 4, raceCountAtJoin: 5 }),
      occurrence("o6", "r6", { projectedPosition: 5, raceCountAtJoin: 5 }),
      occurrence("o7", "r7", { projectedPosition: 6, raceCountAtJoin: 5 }),
      occurrence("o8", "r8", { projectedPosition: 7, raceCountAtJoin: 5 })
    ];
    const updated = addQueueSignup(occurrences, {
      eventId: "e1",
      racerId: "r9",
      occurrenceId: "o9",
      timestamp,
      signupSequence: 9,
      raceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(updated);

    expect(result.entries.slice(0, 3).map((candidate) => candidate.racerIds)).toEqual([
      ["r1", "r4"],
      ["r2", "r3"],
      ["r5", "r6"]
    ]);
    expect(result.entries[3].racerIds).toEqual(["r9", "r7"]);
  });

  it("anchors a new challenge at the challenger's existing queue occurrence", () => {
    const updated = addQueueSignup([occurrence("o1", "r1"), occurrence("o2", "r2")], {
      eventId: "e1",
      racerId: "r1",
      opponentRacerId: "r3",
      occurrenceId: "o3",
      opponentOccurrenceId: "o4",
      lockGroupId: "lock-1",
      timestamp,
      signupSequence: 3,
      raceCountAtJoin: 0,
      opponentRaceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(updated);

    expect(result.entries[0]).toMatchObject({
      requestedType: "match",
      lockType: "challenge",
      racerIds: ["r1", "r3"],
      occurrenceIds: ["o1", "o4"]
    });
    expect(result.entries[1]).toMatchObject({
      requestedType: "auto-match",
      racerIds: ["r2"]
    });
  });

  it("anchors a challenge at the opponent's existing spot when the opponent races sooner", () => {
    const occurrences = [
      occurrence("o1", "r1", { projectedPosition: 3, signupSequence: 3 }),
      occurrence("o2", "r2", { projectedPosition: 1, signupSequence: 1 }),
      occurrence("o3", "r3", { projectedPosition: 1, signupSequence: 2 }),
      occurrence("o4", "r4", { projectedPosition: 3, signupSequence: 4 })
    ];
    const entries = [
      entry("q1", ["o2", "o3"], ["r2", "r3"], { position: 1 }),
      entry("q2", ["o1", "o4"], ["r1", "r4"], { position: 2 })
    ];

    const updated = addQueueSignup(occurrences, {
      eventId: "e1",
      racerId: "r1",
      opponentRacerId: "r2",
      occurrenceId: "o-new",
      opponentOccurrenceId: "o-new-opponent",
      lockGroupId: "lock-1",
      timestamp,
      signupSequence: 5,
      raceCountAtJoin: 0,
      opponentRaceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(updated, entries);

    expect(updated).toHaveLength(occurrences.length);
    expect(result.entries[0]).toMatchObject({
      requestedType: "match",
      lockType: "challenge",
      racerIds: ["r2", "r1"],
      occurrenceIds: ["o2", "o1"]
    });
    expect(result.entries[1]).toMatchObject({
      requestedType: "auto-match",
      racerIds: ["r3", "r4"]
    });
  });

  it("anchors a challenge at the challenger's existing spot when the challenger races sooner", () => {
    const occurrences = [
      occurrence("o1", "r1", { projectedPosition: 1, signupSequence: 1 }),
      occurrence("o2", "r2", { projectedPosition: 3, signupSequence: 3 }),
      occurrence("o3", "r3", { projectedPosition: 1, signupSequence: 2 }),
      occurrence("o4", "r4", { projectedPosition: 3, signupSequence: 4 })
    ];
    const entries = [
      entry("q1", ["o1", "o3"], ["r1", "r3"], { position: 1 }),
      entry("q2", ["o2", "o4"], ["r2", "r4"], { position: 2 })
    ];

    const updated = addQueueSignup(occurrences, {
      eventId: "e1",
      racerId: "r1",
      opponentRacerId: "r2",
      occurrenceId: "o-new",
      opponentOccurrenceId: "o-new-opponent",
      lockGroupId: "lock-1",
      timestamp,
      signupSequence: 5,
      raceCountAtJoin: 0,
      opponentRaceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(updated, entries);

    expect(updated).toHaveLength(occurrences.length);
    expect(result.entries[0]).toMatchObject({
      requestedType: "match",
      lockType: "challenge",
      racerIds: ["r1", "r2"],
      occurrenceIds: ["o1", "o2"]
    });
    expect(result.entries[1]).toMatchObject({
      requestedType: "auto-match",
      racerIds: ["r3", "r4"]
    });
  });

  it("uses an opponent's existing spot when the challenger is not queued yet", () => {
    const occurrences = [
      occurrence("o1", "r2", { projectedPosition: 1, signupSequence: 1 }),
      occurrence("o2", "r3", { projectedPosition: 1, signupSequence: 2 })
    ];
    const entries = [entry("q1", ["o1", "o2"], ["r2", "r3"], { position: 1 })];

    const updated = addQueueSignup(occurrences, {
      eventId: "e1",
      racerId: "r1",
      opponentRacerId: "r2",
      occurrenceId: "o3",
      opponentOccurrenceId: "o4",
      lockGroupId: "lock-1",
      timestamp,
      signupSequence: 3,
      raceCountAtJoin: 0,
      opponentRaceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(updated, entries);

    expect(updated).toHaveLength(3);
    expect(result.entries[0]).toMatchObject({
      requestedType: "match",
      lockType: "challenge",
      racerIds: ["r2", "r1"],
      occurrenceIds: ["o1", "o3"]
    });
    expect(result.entries[1]).toMatchObject({
      requestedType: "auto-match",
      racerIds: ["r3"]
    });
  });

  it("inserts a new challenge by the average priority of both racers when neither is queued", () => {
    const existing = Array.from({ length: 8 }, (_value, index) =>
      occurrence(`o${String(index + 1)}`, `r${String(index + 1)}`, {
        projectedPosition: index + 1,
        raceCountAtJoin: 4
      })
    );
    const updated = addQueueSignup(existing, {
      eventId: "e1",
      racerId: "r9",
      opponentRacerId: "r10",
      occurrenceId: "o9",
      opponentOccurrenceId: "o10",
      lockGroupId: "lock-new",
      timestamp,
      signupSequence: 9,
      raceCountAtJoin: 0,
      opponentRaceCountAtJoin: 4,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(updated);

    expect(result.entries.slice(0, 3).map((candidate) => candidate.racerIds)).toEqual([
      ["r1", "r2"],
      ["r3", "r4"],
      ["r5", "r6"]
    ]);
    expect(result.entries[3]).toMatchObject({
      requestedType: "match",
      lockType: "challenge",
      racerIds: ["r9", "r10"],
      priorityScore: 10
    });
    expect(updated.find((candidate) => candidate.id === "o7")?.bumpCount).toBe(1);
    expect(updated.find((candidate) => candidate.id === "o8")?.bumpCount).toBe(1);
  });

  it("rejects a challenge where the racer selected themselves as opponent", () => {
    expect(() =>
      addQueueSignup([], {
        eventId: "e1",
        racerId: "r1",
        opponentRacerId: "r1",
        occurrenceId: "o1",
        timestamp,
        signupSequence: 1,
        raceCountAtJoin: 0,
        opponentRaceCountAtJoin: 0,
        maxActiveOccurrencesPerRacer: 3
      })
    ).toThrow("cannot challenge themselves");
  });

  it("counts locked challenge entries toward the per-racer active queue limit", () => {
    const occurrences = [
      occurrence("o1", "r1", { intent: "challenge", lockGroupId: "lock-1" }),
      occurrence("o2", "r2", { intent: "challenge", lockGroupId: "lock-1" }),
      occurrence("o3", "r1", { intent: "challenge", lockGroupId: "lock-2" }),
      occurrence("o4", "r3", { intent: "challenge", lockGroupId: "lock-2" }),
      occurrence("o5", "r1", { intent: "challenge", lockGroupId: "lock-3" }),
      occurrence("o6", "r4", { intent: "challenge", lockGroupId: "lock-3" })
    ];

    expect(() =>
      addQueueSignup(occurrences, {
        eventId: "e1",
        racerId: "r1",
        occurrenceId: "o7",
        timestamp,
        signupSequence: 7,
        raceCountAtJoin: 0,
        maxActiveOccurrencesPerRacer: 3
      })
    ).toThrow("maximum of 3 active queue entries");
  });

  it("asks a maxed challenger with only challenge matches to choose a replacement", () => {
    const occurrences = [
      occurrence("o1", "r1", { intent: "challenge", lockGroupId: "lock-1" }),
      occurrence("o2", "r2", { intent: "challenge", lockGroupId: "lock-1" }),
      occurrence("o3", "r1", { intent: "challenge", lockGroupId: "lock-2" }),
      occurrence("o4", "r3", { intent: "challenge", lockGroupId: "lock-2" }),
      occurrence("o5", "r1", { intent: "challenge", lockGroupId: "lock-3" }),
      occurrence("o6", "r4", { intent: "challenge", lockGroupId: "lock-3" })
    ];

    expect(() =>
      addQueueSignup(occurrences, {
        eventId: "e1",
        racerId: "r1",
        opponentRacerId: "r5",
        occurrenceId: "o7",
        opponentOccurrenceId: "o8",
        lockGroupId: "lock-4",
        timestamp,
        signupSequence: 7,
        raceCountAtJoin: 0,
        opponentRaceCountAtJoin: 0,
        maxActiveOccurrencesPerRacer: 3
      })
    ).toThrow(ChallengeReplacementRequiredError);
  });

  it("replaces the selected challenge slot and keeps the former opponent queued", () => {
    const occurrences = [
      occurrence("o1", "r1", {
        intent: "challenge",
        lockGroupId: "lock-1",
        projectedPosition: 1
      }),
      occurrence("o2", "r2", {
        intent: "challenge",
        lockGroupId: "lock-1",
        projectedPosition: 1
      }),
      occurrence("o3", "r1", {
        intent: "challenge",
        lockGroupId: "lock-2",
        projectedPosition: 2
      }),
      occurrence("o4", "r3", {
        intent: "challenge",
        lockGroupId: "lock-2",
        projectedPosition: 2
      }),
      occurrence("o5", "r1", {
        intent: "challenge",
        lockGroupId: "lock-3",
        projectedPosition: 3
      }),
      occurrence("o6", "r4", {
        intent: "challenge",
        lockGroupId: "lock-3",
        projectedPosition: 3
      })
    ];

    const updated = addQueueSignup(occurrences, {
      eventId: "e1",
      racerId: "r1",
      opponentRacerId: "r5",
      replaceOccurrenceId: "o3",
      occurrenceId: "o7",
      opponentOccurrenceId: "o8",
      lockGroupId: "lock-4",
      timestamp,
      signupSequence: 7,
      raceCountAtJoin: 0,
      opponentRaceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(updated);

    expect(result.entries[1]).toMatchObject({
      requestedType: "match",
      lockType: "challenge",
      racerIds: ["r1", "r5"],
      occurrenceIds: ["o3", "o8"]
    });
    expect(result.entries[2]).toMatchObject({
      requestedType: "auto-match",
      racerIds: ["r3"]
    });
  });

  it("uses the opponent's earlier flexible slot even after the challenger chooses a replacement", () => {
    const occurrences = [
      occurrence("o1", "r6", { projectedPosition: 1, signupSequence: 1 }),
      occurrence("o2", "r7", { projectedPosition: 1, signupSequence: 2 }),
      occurrence("o3", "r1", {
        intent: "challenge",
        lockGroupId: "lock-1",
        projectedPosition: 2,
        signupSequence: 3
      }),
      occurrence("o4", "r2", {
        intent: "challenge",
        lockGroupId: "lock-1",
        projectedPosition: 2,
        signupSequence: 4
      }),
      occurrence("o5", "r1", {
        intent: "challenge",
        lockGroupId: "lock-2",
        projectedPosition: 3,
        signupSequence: 5
      }),
      occurrence("o6", "r3", {
        intent: "challenge",
        lockGroupId: "lock-2",
        projectedPosition: 3,
        signupSequence: 6
      }),
      occurrence("o7", "r1", {
        intent: "challenge",
        lockGroupId: "lock-3",
        projectedPosition: 4,
        signupSequence: 7
      }),
      occurrence("o8", "r4", {
        intent: "challenge",
        lockGroupId: "lock-3",
        projectedPosition: 4,
        signupSequence: 8
      })
    ];

    const updated = addQueueSignup(occurrences, {
      eventId: "e1",
      racerId: "r1",
      opponentRacerId: "r6",
      replaceOccurrenceId: "o5",
      occurrenceId: "o9",
      opponentOccurrenceId: "o10",
      lockGroupId: "lock-4",
      timestamp,
      signupSequence: 9,
      raceCountAtJoin: 0,
      opponentRaceCountAtJoin: 0,
      maxActiveOccurrencesPerRacer: 3
    });
    const result = project(updated);

    expect(result.entries[0]).toMatchObject({
      requestedType: "match",
      lockType: "challenge",
      racerIds: ["r6", "r1"],
      occurrenceIds: ["o1", "o5"]
    });
    expect(result.entries[1]).toMatchObject({
      requestedType: "auto-match",
      racerIds: ["r7", "r3"]
    });
  });

  it("rejects challenges against a target whose active queue is only challenge matches", () => {
    const occurrences = [
      occurrence("o1", "r9", { projectedPosition: 1 }),
      occurrence("o2", "r10", { projectedPosition: 1 }),
      occurrence("o3", "r1", { intent: "challenge", lockGroupId: "lock-1" }),
      occurrence("o4", "r2", { intent: "challenge", lockGroupId: "lock-1" }),
      occurrence("o5", "r1", { intent: "challenge", lockGroupId: "lock-2" }),
      occurrence("o6", "r3", { intent: "challenge", lockGroupId: "lock-2" }),
      occurrence("o7", "r1", { intent: "challenge", lockGroupId: "lock-3" }),
      occurrence("o8", "r4", { intent: "challenge", lockGroupId: "lock-3" })
    ];

    expect(() =>
      addQueueSignup(occurrences, {
        eventId: "e1",
        racerId: "r9",
        opponentRacerId: "r1",
        occurrenceId: "o11",
        opponentOccurrenceId: "o12",
        lockGroupId: "lock-4",
        timestamp,
        signupSequence: 11,
        raceCountAtJoin: 0,
        opponentRaceCountAtJoin: 0,
        maxActiveOccurrencesPerRacer: 3
      })
    ).toThrow(ChallengeTargetUnavailableError);
  });

  it("rejects signups above the configured per-racer active queue limit", () => {
    const occurrences = [occurrence("o1", "r1"), occurrence("o2", "r1"), occurrence("o3", "r1")];

    expect(() =>
      addQueueSignup(occurrences, {
        eventId: "e1",
        racerId: "r1",
        occurrenceId: "o4",
        timestamp,
        signupSequence: 4,
        raceCountAtJoin: 0,
        maxActiveOccurrencesPerRacer: 3
      })
    ).toThrow("maximum of 3 active queue entries");
  });

  it("uses the average priority of both racers in a challenge match", () => {
    const result = project(
      [
        occurrence("o1", "r1", { intent: "challenge", lockGroupId: "lock-1" }),
        occurrence("o2", "r2", { intent: "challenge", lockGroupId: "lock-1" }),
        occurrence("o3", "r3"),
        occurrence("o4", "r4")
      ],
      [],
      {
        r1: 0,
        r2: 4,
        r3: 1,
        r4: 1
      }
    );

    expect(result.entries[0]).toMatchObject({
      racerIds: ["r1", "r2"],
      priorityScore: 10
    });
    expect(result.entries[1].priorityScore).toBe(-20);
  });

  it("releases the remaining racer from a broken challenge back into auto-match flow", () => {
    const entries = [
      entry("q1", ["o1", "o2"], ["r1", "r2"], {
        requestedType: "match",
        lockType: "challenge"
      })
    ];
    const occurrences = [
      occurrence("o1", "r1", { intent: "challenge", lockGroupId: "lock-1" }),
      occurrence("o2", "r2", { intent: "challenge", lockGroupId: "lock-1" }),
      occurrence("o3", "r3")
    ];

    const removed = removeRacerFromQueue(occurrences, "r2");
    const result = project(removed, entries);

    expect(result.entries[0]).toMatchObject({
      requestedType: "auto-match",
      lockType: "flex",
      racerIds: ["r1", "r3"]
    });
  });
});
