import type { QueueEntry } from "../../shared/types";

export function reindexQueue(entries: QueueEntry[]): QueueEntry[] {
  return [...entries]
    .sort((left, right) => left.position - right.position)
    .map((entry, index) => ({
      ...entry,
      position: index + 1
    }));
}

export function isQueueEntryReady(entry: QueueEntry): boolean {
  // Auto-match signups stay in the queue until a second rider completes the matchup.
  return !(entry.requestedType === "auto-match" && entry.racerIds.length < 2);
}

function isLockedQueueEntry(entry: QueueEntry): boolean {
  return entry.requestedType === "match" || entry.status !== "queued";
}

function rebuildShiftableSegment(entries: QueueEntry[]): QueueEntry[] {
  if (entries.length === 0) {
    return [];
  }

  const templates = [...entries].sort((left, right) => left.position - right.position);
  const rebuilt: QueueEntry[] = [];
  const slots = templates.flatMap((entry) =>
    entry.racerIds.map((racerId) => ({
      racerId,
      requestedType: entry.requestedType
    }))
  );
  let templateIndex = 0;
  let pendingAutoMatchRacerId: string | null = null;

  const pushEntry = (input: {
    racerIds: string[];
    requestedType: QueueEntry["requestedType"];
  }): void => {
    const template = templates[templateIndex];
    templateIndex += 1;
    rebuilt.push({
      ...template,
      type: input.racerIds.length > 1 ? "match" : "solo",
      requestedType: input.requestedType,
      racerIds: input.racerIds
    });
  };

  for (const slot of slots) {
    if (slot.requestedType === "solo") {
      // A manually queued solo run keeps its position in the flow, so any waiting auto-match rider
      // ahead of it must stay ahead of it instead of being paired with someone after the solo slot.
      if (pendingAutoMatchRacerId) {
        pushEntry({
          racerIds: [pendingAutoMatchRacerId],
          requestedType: "auto-match"
        });
        pendingAutoMatchRacerId = null;
      }

      pushEntry({
        racerIds: [slot.racerId],
        requestedType: "solo"
      });
      continue;
    }

    if (pendingAutoMatchRacerId) {
      pushEntry({
        racerIds: [pendingAutoMatchRacerId, slot.racerId],
        requestedType: "auto-match"
      });
      pendingAutoMatchRacerId = null;
      continue;
    }

    pendingAutoMatchRacerId = slot.racerId;
  }

  if (pendingAutoMatchRacerId) {
    pushEntry({
      racerIds: [pendingAutoMatchRacerId],
      requestedType: "auto-match"
    });
  }

  return rebuilt;
}

function compactQueue(entries: QueueEntry[]): QueueEntry[] {
  const ordered = [...entries].sort((left, right) => left.position - right.position);
  const compacted: QueueEntry[] = [];
  let shiftableSegment: QueueEntry[] = [];

  const flushSegment = (): void => {
    compacted.push(...rebuildShiftableSegment(shiftableSegment));
    shiftableSegment = [];
  };

  for (const entry of ordered) {
    if (isLockedQueueEntry(entry)) {
      flushSegment();
      compacted.push(entry);
      continue;
    }

    shiftableSegment.push(entry);
  }

  flushSegment();
  return reindexQueue(compacted);
}

export function addQueueSignup(
  entries: QueueEntry[],
  input: {
    eventId: string;
    racerId: string;
    opponentRacerId?: string;
    requestedType?: "solo" | "auto-match";
    entryId: string;
    timestamp: string;
  }
): QueueEntry[] {
  const next = reindexQueue(entries);

  if (input.opponentRacerId) {
    return [
      ...next,
      {
        id: input.entryId,
        eventId: input.eventId,
        type: "match",
        requestedType: "match",
        position: next.length + 1,
        racerIds: [input.racerId, input.opponentRacerId],
        status: "queued",
        createdAt: input.timestamp,
        updatedAt: input.timestamp
      }
    ];
  }

  if (input.requestedType === "solo") {
    return [
      ...next,
      {
        id: input.entryId,
        eventId: input.eventId,
        type: "solo",
        requestedType: "solo",
        position: next.length + 1,
        racerIds: [input.racerId],
        status: "queued",
        createdAt: input.timestamp,
        updatedAt: input.timestamp
      }
    ];
  }

  const pendingAutoMatch = next.find(
    (entry) =>
      entry.status === "queued" &&
      entry.requestedType === "auto-match" &&
      entry.racerIds.length === 1 &&
      entry.racerIds[0] !== input.racerId
  );

  if (!pendingAutoMatch) {
    return [
      ...next,
      {
        id: input.entryId,
        eventId: input.eventId,
        type: "solo",
        requestedType: "auto-match",
        position: next.length + 1,
        racerIds: [input.racerId],
        status: "queued",
        createdAt: input.timestamp,
        updatedAt: input.timestamp
      }
    ];
  }

  return next.map((entry) =>
    entry.id === pendingAutoMatch.id
      ? {
          ...entry,
          type: "match",
          racerIds: [...entry.racerIds, input.racerId],
          updatedAt: input.timestamp
        }
      : entry
  );
}

export function removeRacerFromQueue(entries: QueueEntry[], racerId: string): QueueEntry[] {
  const updated = entries.flatMap((entry) => {
    if (!entry.racerIds.includes(racerId)) {
      return entry;
    }

    if (entry.type === "solo") {
      return [];
    }

    const remaining = entry.racerIds.filter((id) => id !== racerId);
    if (remaining.length === 0) {
      return [];
    }

    return {
      ...entry,
      type: remaining.length === 1 ? "solo" : "match",
      requestedType: remaining.length === 1 ? "auto-match" : entry.requestedType,
      racerIds: remaining
    } satisfies QueueEntry;
  });

  return compactQueue(updated);
}

export function removeRacerFromSpecificQueueEntry(
  entries: QueueEntry[],
  entryId: string,
  racerId: string
): QueueEntry[] {
  const updated = entries.flatMap((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }

    if (!entry.racerIds.includes(racerId)) {
      return entry;
    }

    if (entry.type === "solo") {
      return [];
    }

    const remaining = entry.racerIds.filter((id) => id !== racerId);
    if (remaining.length === 0) {
      return [];
    }

    return {
      ...entry,
      type: remaining.length === 1 ? "solo" : "match",
      requestedType: remaining.length === 1 ? "auto-match" : entry.requestedType,
      racerIds: remaining
    } satisfies QueueEntry;
  });

  return compactQueue(updated);
}

export function findNextQueuedEntry(entries: QueueEntry[]): QueueEntry | null {
  return (
    [...entries]
      .filter((entry) => entry.status === "queued" && isQueueEntryReady(entry))
      .sort((left, right) => left.position - right.position)[0] ?? null
  );
}
