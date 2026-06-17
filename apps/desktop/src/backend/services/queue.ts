import type { QueueEntry, QueueOccurrence } from "@roller-rumble/shared/types";

export interface QueueRacerStats {
  raceCount: number;
}

interface QueueProjectionInput {
  entries: QueueEntry[];
  occurrences: QueueOccurrence[];
  eventId: string;
  timestamp: string;
  getEntryId: () => string;
  racerStatsById?: Map<string, QueueRacerStats>;
}

interface QueueSignupInput {
  eventId: string;
  racerId: string;
  opponentRacerId?: string;
  requestedType?: "solo" | "auto-match";
  replaceOccurrenceId?: string;
  occurrenceId: string;
  opponentOccurrenceId?: string;
  lockGroupId?: string;
  timestamp: string;
  signupSequence: number;
  raceCountAtJoin: number;
  opponentRaceCountAtJoin?: number;
  maxActiveOccurrencesPerRacer: number;
  racerStatsById?: Map<string, QueueRacerStats>;
}

interface QueueSlot {
  kind: "auto-match" | "solo" | "challenge";
  occurrences: QueueOccurrence[];
  position: number;
  priorityScore: number;
  signupSequence: number;
}

interface DerivedQueueBlock {
  kind: QueueSlot["kind"];
  lockType: QueueEntry["lockType"];
  occurrenceIds: string[];
  priorityScore: number;
  racerIds: string[];
  slotIndexes: number[];
  signupSequence: number;
}

const ACTIVE_OCCURRENCE_STATUSES = new Set<QueueOccurrence["status"]>([
  "queued",
  "staging",
  "racing"
]);
const PROTECTED_DERIVED_MATCH_COUNT = 3;

export class ChallengeReplacementRequiredError extends Error {
  constructor(readonly racerId: string) {
    super("Choose one of your existing challenge matches to replace.");
  }
}

export class ChallengeTargetUnavailableError extends Error {
  constructor(readonly racerId: string) {
    super("That racer is already locked into challenge matches and cannot be challenged yet.");
  }
}

export class InvalidChallengeReplacementError extends Error {
  constructor() {
    super("Choose a valid queued challenge match to replace.");
  }
}

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

function countActiveOccurrences(occurrences: QueueOccurrence[], racerId: string): number {
  return occurrences.filter(
    (occurrence) =>
      occurrence.racerId === racerId && ACTIVE_OCCURRENCE_STATUSES.has(occurrence.status)
  ).length;
}

function getActiveOccurrences(occurrences: QueueOccurrence[], racerId: string): QueueOccurrence[] {
  return occurrences.filter(
    (occurrence) =>
      occurrence.racerId === racerId && ACTIVE_OCCURRENCE_STATUSES.has(occurrence.status)
  );
}

function hasOnlyActiveChallengeOccurrences(
  occurrences: QueueOccurrence[],
  racerId: string
): boolean {
  const activeOccurrences = getActiveOccurrences(occurrences, racerId);
  return (
    activeOccurrences.length > 0 &&
    activeOccurrences.every(
      (occurrence) => occurrence.intent === "challenge" && Boolean(occurrence.lockGroupId)
    )
  );
}

function assertCanAddOccurrence(
  occurrences: QueueOccurrence[],
  racerId: string,
  maxActiveOccurrencesPerRacer: number
): void {
  if (countActiveOccurrences(occurrences, racerId) >= maxActiveOccurrencesPerRacer) {
    throw new Error(
      `Racer already has the maximum of ${String(maxActiveOccurrencesPerRacer)} active queue entries.`
    );
  }
}

function assertCanAddChallengeOccurrence(
  occurrences: QueueOccurrence[],
  racerId: string,
  maxActiveOccurrencesPerRacer: number,
  role: "challenger" | "opponent"
): void {
  if (countActiveOccurrences(occurrences, racerId) < maxActiveOccurrencesPerRacer) {
    return;
  }

  if (hasOnlyActiveChallengeOccurrences(occurrences, racerId)) {
    if (role === "challenger") {
      throw new ChallengeReplacementRequiredError(racerId);
    }

    throw new ChallengeTargetUnavailableError(racerId);
  }

  throw new Error(
    `Racer already has the maximum of ${String(maxActiveOccurrencesPerRacer)} active queue entries.`
  );
}

function createOccurrence(input: {
  eventId: string;
  racerId: string;
  id: string;
  intent: QueueOccurrence["intent"];
  lockGroupId: string | null;
  timestamp: string;
  signupSequence: number;
  raceCountAtJoin: number;
}): QueueOccurrence {
  return {
    id: input.id,
    eventId: input.eventId,
    racerId: input.racerId,
    status: "queued",
    intent: input.intent,
    lockGroupId: input.lockGroupId,
    signupSequence: input.signupSequence,
    bumpCount: 0,
    raceCountAtJoin: input.raceCountAtJoin,
    projectedPosition: null,
    createdAt: input.timestamp,
    updatedAt: input.timestamp
  };
}

function getOccurrenceSlotPosition(occurrence: QueueOccurrence): number {
  return occurrence.projectedPosition ?? occurrence.signupSequence;
}

function compareQueuedOccurrences(left: QueueOccurrence, right: QueueOccurrence): number {
  return (
    getOccurrenceSlotPosition(left) - getOccurrenceSlotPosition(right) ||
    left.signupSequence - right.signupSequence
  );
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function calculateQueueOccurrencePriority(
  occurrence: QueueOccurrence,
  stats?: QueueRacerStats
): number {
  const raceCount = stats?.raceCount ?? occurrence.raceCountAtJoin;
  const newRacerBoost = raceCount === 0 ? 100 : 0;
  return newRacerBoost + occurrence.bumpCount * 40 - raceCount * 20;
}

function calculateQueueSlotPriority(
  occurrences: QueueOccurrence[],
  racerStatsById: Map<string, QueueRacerStats>
): number {
  return average(
    occurrences.map((occurrence) =>
      calculateQueueOccurrencePriority(occurrence, racerStatsById.get(occurrence.racerId))
    )
  );
}

function createQueueSlot(
  kind: QueueSlot["kind"],
  occurrences: QueueOccurrence[],
  racerStatsById: Map<string, QueueRacerStats>
): QueueSlot {
  const orderedOccurrences = [...occurrences].sort(compareQueuedOccurrences);

  return {
    kind,
    occurrences: orderedOccurrences,
    position: Math.min(...orderedOccurrences.map(getOccurrenceSlotPosition)),
    priorityScore: calculateQueueSlotPriority(orderedOccurrences, racerStatsById),
    signupSequence: Math.min(...orderedOccurrences.map((occurrence) => occurrence.signupSequence))
  };
}

function releaseOrphanedChallengeOccurrences(occurrences: QueueOccurrence[]): QueueOccurrence[] {
  const activeChallengeCounts = new Map<string, number>();
  for (const occurrence of occurrences) {
    if (
      occurrence.lockGroupId &&
      occurrence.intent === "challenge" &&
      occurrence.status === "queued"
    ) {
      activeChallengeCounts.set(
        occurrence.lockGroupId,
        (activeChallengeCounts.get(occurrence.lockGroupId) ?? 0) + 1
      );
    }
  }

  return occurrences.map((occurrence) => {
    if (
      !occurrence.lockGroupId ||
      occurrence.intent !== "challenge" ||
      occurrence.status !== "queued" ||
      (activeChallengeCounts.get(occurrence.lockGroupId) ?? 0) > 1
    ) {
      return occurrence;
    }

    return {
      ...occurrence,
      intent: "auto-match",
      lockGroupId: null
    };
  });
}

function buildQueueSlots(
  occurrences: QueueOccurrence[],
  racerStatsById: Map<string, QueueRacerStats>
): QueueSlot[] {
  const queuedOccurrences = occurrences.filter((occurrence) => occurrence.status === "queued");
  const challengeGroups = new Map<string, QueueOccurrence[]>();

  for (const occurrence of queuedOccurrences) {
    if (occurrence.intent !== "challenge" || !occurrence.lockGroupId) {
      continue;
    }

    challengeGroups.set(occurrence.lockGroupId, [
      ...(challengeGroups.get(occurrence.lockGroupId) ?? []),
      occurrence
    ]);
  }

  const challengeOccurrenceIds = new Set(
    [...challengeGroups.values()].flat().map((occurrence) => occurrence.id)
  );
  const slots: QueueSlot[] = [];

  for (const group of challengeGroups.values()) {
    slots.push(createQueueSlot("challenge", group, racerStatsById));
  }

  for (const occurrence of queuedOccurrences) {
    if (challengeOccurrenceIds.has(occurrence.id)) {
      continue;
    }

    slots.push(
      createQueueSlot(
        occurrence.intent === "solo" ? "solo" : "auto-match",
        [occurrence],
        racerStatsById
      )
    );
  }

  return slots
    .sort(
      (left, right) => left.position - right.position || left.signupSequence - right.signupSequence
    )
    .map((slot, index) => ({
      ...slot,
      position: index + 1
    }));
}

function deriveQueueBlocks(slots: QueueSlot[]): DerivedQueueBlock[] {
  const consumedSlotIndexes = new Set<number>();
  const blocks: DerivedQueueBlock[] = [];

  slots.forEach((slot, index) => {
    if (consumedSlotIndexes.has(index)) {
      return;
    }

    if (slot.kind === "challenge") {
      consumedSlotIndexes.add(index);
      blocks.push({
        kind: "challenge",
        lockType: "challenge",
        occurrenceIds: slot.occurrences.map((occurrence) => occurrence.id),
        priorityScore: slot.priorityScore,
        racerIds: slot.occurrences.map((occurrence) => occurrence.racerId),
        slotIndexes: [index],
        signupSequence: slot.signupSequence
      });
      return;
    }

    if (slot.kind === "solo") {
      consumedSlotIndexes.add(index);
      blocks.push({
        kind: "solo",
        lockType: "flex",
        occurrenceIds: slot.occurrences.map((occurrence) => occurrence.id),
        priorityScore: slot.priorityScore,
        racerIds: slot.occurrences.map((occurrence) => occurrence.racerId),
        slotIndexes: [index],
        signupSequence: slot.signupSequence
      });
      return;
    }

    const racerId = slot.occurrences[0].racerId;
    const pairedSlotIndex = slots.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        !consumedSlotIndexes.has(candidateIndex) &&
        candidate.kind === "auto-match" &&
        candidate.occurrences[0]?.racerId !== racerId
    );

    if (pairedSlotIndex === -1) {
      consumedSlotIndexes.add(index);
      blocks.push({
        kind: "auto-match",
        lockType: "flex",
        occurrenceIds: slot.occurrences.map((occurrence) => occurrence.id),
        priorityScore: slot.priorityScore,
        racerIds: [racerId],
        slotIndexes: [index],
        signupSequence: slot.signupSequence
      });
      return;
    }

    const pairedSlot = slots[pairedSlotIndex];
    consumedSlotIndexes.add(index);
    consumedSlotIndexes.add(pairedSlotIndex);
    blocks.push({
      kind: "auto-match",
      lockType: "flex",
      occurrenceIds: [
        ...slot.occurrences.map((occurrence) => occurrence.id),
        ...pairedSlot.occurrences.map((occurrence) => occurrence.id)
      ],
      priorityScore: average([slot.priorityScore, pairedSlot.priorityScore]),
      racerIds: [racerId, pairedSlot.occurrences[0].racerId],
      slotIndexes: [index, pairedSlotIndex],
      signupSequence: Math.min(slot.signupSequence, pairedSlot.signupSequence)
    });
  });

  return blocks;
}

function getProtectedInsertIndex(slots: QueueSlot[]): number {
  const protectedSlotIndexes = deriveQueueBlocks(slots)
    .slice(0, PROTECTED_DERIVED_MATCH_COUNT)
    .flatMap((block) => block.slotIndexes);

  if (protectedSlotIndexes.length === 0) {
    return 0;
  }

  return Math.max(...protectedSlotIndexes) + 1;
}

function bumpSlotsFromIndex(
  slots: QueueSlot[],
  insertIndex: number,
  timestamp: string
): QueueSlot[] {
  return slots.map((slot, index) => {
    if (index < insertIndex) {
      return slot;
    }

    return {
      ...slot,
      occurrences: slot.occurrences.map((occurrence) => ({
        ...occurrence,
        bumpCount: occurrence.bumpCount + 1,
        updatedAt: timestamp
      }))
    };
  });
}

function insertSlotByPriority(
  slots: QueueSlot[],
  newSlot: QueueSlot,
  timestamp: string
): QueueSlot[] {
  const protectedInsertIndex = getProtectedInsertIndex(slots);
  const insertionIndexCandidate = slots.findIndex(
    (slot, index) => index >= protectedInsertIndex && slot.priorityScore < newSlot.priorityScore
  );
  const insertionIndex = insertionIndexCandidate === -1 ? slots.length : insertionIndexCandidate;
  const bumpedSlots = bumpSlotsFromIndex(slots, insertionIndex, timestamp);

  return [...bumpedSlots.slice(0, insertionIndex), newSlot, ...bumpedSlots.slice(insertionIndex)];
}

function flattenSlots(slots: QueueSlot[], timestamp: string): QueueOccurrence[] {
  return slots.flatMap((slot, index) =>
    slot.occurrences.map((occurrence) => ({
      ...occurrence,
      projectedPosition: index + 1,
      updatedAt: timestamp
    }))
  );
}

function mergeOccurrencesWithSlots(
  occurrences: QueueOccurrence[],
  slots: QueueSlot[],
  timestamp: string
): QueueOccurrence[] {
  const queuedOccurrenceIds = new Set(
    occurrences
      .filter((occurrence) => occurrence.status === "queued")
      .map((occurrence) => occurrence.id)
  );

  return [
    ...occurrences.filter((occurrence) => !queuedOccurrenceIds.has(occurrence.id)),
    ...flattenSlots(slots, timestamp)
  ];
}

function findFlexibleAnchor(
  slots: QueueSlot[],
  racerId: string
): { occurrence: QueueOccurrence; slotIndex: number } | null {
  for (const [slotIndex, slot] of slots.entries()) {
    if (slot.kind === "challenge") {
      continue;
    }

    const occurrence = slot.occurrences.find((candidate) => candidate.racerId === racerId);
    if (occurrence) {
      return { occurrence, slotIndex };
    }
  }

  return null;
}

function findChallengeReplacementAnchor(
  slots: QueueSlot[],
  racerId: string,
  occurrenceId: string
): { occurrence: QueueOccurrence; slotIndex: number } | null {
  for (const [slotIndex, slot] of slots.entries()) {
    if (slot.kind !== "challenge") {
      continue;
    }

    const occurrence = slot.occurrences.find(
      (candidate) => candidate.id === occurrenceId && candidate.racerId === racerId
    );
    if (occurrence) {
      return { occurrence, slotIndex };
    }
  }

  return null;
}

function releaseReplacementSlotRemainder(
  slot: QueueSlot,
  replacedOccurrenceId: string,
  timestamp: string,
  racerStatsById: Map<string, QueueRacerStats>
): QueueSlot | null {
  const remainingOccurrences = slot.occurrences
    .filter((occurrence) => occurrence.id !== replacedOccurrenceId)
    .map((occurrence) => ({
      ...occurrence,
      intent: "auto-match" as const,
      lockGroupId: null,
      updatedAt: timestamp
    }));

  return remainingOccurrences.length > 0
    ? createQueueSlot("auto-match", remainingOccurrences, racerStatsById)
    : null;
}

export function addQueueSignup(
  occurrences: QueueOccurrence[],
  input: QueueSignupInput
): QueueOccurrence[] {
  if (input.opponentRacerId && input.opponentRacerId === input.racerId) {
    throw new Error("A racer cannot challenge themselves.");
  }

  const racerStatsById = input.racerStatsById ?? new Map<string, QueueRacerStats>();
  const normalizedOccurrences = releaseOrphanedChallengeOccurrences(occurrences);
  const slots = buildQueueSlots(normalizedOccurrences, racerStatsById);

  if (!input.opponentRacerId) {
    assertCanAddOccurrence(
      normalizedOccurrences,
      input.racerId,
      input.maxActiveOccurrencesPerRacer
    );
    const occurrence = createOccurrence({
      eventId: input.eventId,
      racerId: input.racerId,
      id: input.occurrenceId,
      intent: input.requestedType === "solo" ? "solo" : "auto-match",
      lockGroupId: null,
      timestamp: input.timestamp,
      signupSequence: input.signupSequence,
      raceCountAtJoin: input.raceCountAtJoin
    });
    const nextSlots = insertSlotByPriority(
      slots,
      createQueueSlot(
        occurrence.intent === "solo" ? "solo" : "auto-match",
        [occurrence],
        racerStatsById
      ),
      input.timestamp
    );

    return mergeOccurrencesWithSlots(normalizedOccurrences, nextSlots, input.timestamp);
  }

  const replacementAnchor = input.replaceOccurrenceId
    ? findChallengeReplacementAnchor(slots, input.racerId, input.replaceOccurrenceId)
    : null;
  if (input.replaceOccurrenceId && !replacementAnchor) {
    throw new InvalidChallengeReplacementError();
  }

  const challengerAnchor = replacementAnchor ?? findFlexibleAnchor(slots, input.racerId);
  const opponentAnchor = findFlexibleAnchor(slots, input.opponentRacerId);
  const needsChallengerOccurrence = challengerAnchor === null;
  const needsOpponentOccurrence = opponentAnchor === null;

  if (needsChallengerOccurrence) {
    assertCanAddChallengeOccurrence(
      normalizedOccurrences,
      input.racerId,
      input.maxActiveOccurrencesPerRacer,
      "challenger"
    );
  }
  if (needsOpponentOccurrence) {
    assertCanAddChallengeOccurrence(
      normalizedOccurrences,
      input.opponentRacerId,
      input.maxActiveOccurrencesPerRacer,
      "opponent"
    );
  }

  const lockGroupId = input.lockGroupId ?? input.occurrenceId;
  const challengeOccurrences: QueueOccurrence[] = [
    challengerAnchor
      ? {
          ...challengerAnchor.occurrence,
          intent: "challenge",
          lockGroupId,
          updatedAt: input.timestamp
        }
      : createOccurrence({
          eventId: input.eventId,
          racerId: input.racerId,
          id: input.occurrenceId,
          intent: "challenge",
          lockGroupId,
          timestamp: input.timestamp,
          signupSequence: input.signupSequence,
          raceCountAtJoin: input.raceCountAtJoin
        }),
    opponentAnchor
      ? {
          ...opponentAnchor.occurrence,
          intent: "challenge",
          lockGroupId,
          updatedAt: input.timestamp
        }
      : createOccurrence({
          eventId: input.eventId,
          racerId: input.opponentRacerId,
          id: input.opponentOccurrenceId ?? `${input.occurrenceId}-opponent`,
          intent: "challenge",
          lockGroupId,
          timestamp: input.timestamp,
          signupSequence: input.signupSequence + 1,
          raceCountAtJoin: input.opponentRaceCountAtJoin ?? 0
        })
  ];
  const challengeSlot = createQueueSlot("challenge", challengeOccurrences, racerStatsById);
  const anchorSlotIndexes = [challengerAnchor?.slotIndex, opponentAnchor?.slotIndex].filter(
    (slotIndex): slotIndex is number => slotIndex !== undefined
  );

  if (anchorSlotIndexes.length > 0) {
    const anchorIndex = Math.min(...anchorSlotIndexes);
    const anchorIndexSet = new Set(anchorSlotIndexes);
    const remainingSlots = slots.flatMap((slot, index) => {
      if (index === replacementAnchor?.slotIndex) {
        const remainder = releaseReplacementSlotRemainder(
          slot,
          replacementAnchor.occurrence.id,
          input.timestamp,
          racerStatsById
        );
        return remainder ? [remainder] : [];
      }

      return anchorIndexSet.has(index) ? [] : [slot];
    });

    remainingSlots.splice(anchorIndex, 0, challengeSlot);
    return mergeOccurrencesWithSlots(normalizedOccurrences, remainingSlots, input.timestamp);
  }

  const nextSlots = insertSlotByPriority(slots, challengeSlot, input.timestamp);
  return mergeOccurrencesWithSlots(normalizedOccurrences, nextSlots, input.timestamp);
}

export function removeRacerFromQueue(
  occurrences: QueueOccurrence[],
  racerId: string
): QueueOccurrence[] {
  const timestamp = new Date().toISOString();
  return releaseOrphanedChallengeOccurrences(
    occurrences.map((occurrence) =>
      occurrence.racerId === racerId && ACTIVE_OCCURRENCE_STATUSES.has(occurrence.status)
        ? {
            ...occurrence,
            status: "removed",
            updatedAt: timestamp
          }
        : occurrence
    )
  );
}

export function removeRacerFromSpecificQueueEntry(
  entries: QueueEntry[],
  occurrences: QueueOccurrence[],
  entryId: string,
  racerId: string
): QueueOccurrence[] {
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    return occurrences;
  }

  const removableOccurrenceIds = new Set(entry.occurrenceIds);
  const timestamp = new Date().toISOString();
  return releaseOrphanedChallengeOccurrences(
    occurrences.map((occurrence) =>
      occurrence.racerId === racerId &&
      removableOccurrenceIds.has(occurrence.id) &&
      ACTIVE_OCCURRENCE_STATUSES.has(occurrence.status)
        ? {
            ...occurrence,
            status: "removed",
            updatedAt: timestamp
          }
        : occurrence
    )
  );
}

export function projectQueueEntries(input: QueueProjectionInput): {
  entries: QueueEntry[];
  occurrences: QueueOccurrence[];
} {
  const racerStatsById = input.racerStatsById ?? new Map<string, QueueRacerStats>();
  const normalizedOccurrences = releaseOrphanedChallengeOccurrences(input.occurrences);
  const slots = buildQueueSlots(normalizedOccurrences, racerStatsById);
  const blocks = deriveQueueBlocks(slots);
  const existingByOccurrenceKey = new Map(
    input.entries
      .filter((entry) => entry.status === "queued")
      .map((entry) => [entry.occurrenceIds.join("|"), entry])
  );

  const entries = blocks.map((block, index) => {
    const position = index + 1;
    const existing = existingByOccurrenceKey.get(block.occurrenceIds.join("|"));

    return {
      id: existing?.id ?? input.getEntryId(),
      eventId: input.eventId,
      type: block.racerIds.length > 1 ? "match" : "solo",
      requestedType: block.kind === "challenge" ? "match" : block.kind,
      lockType: block.lockType,
      position,
      racerIds: block.racerIds,
      occurrenceIds: block.occurrenceIds,
      priorityScore: block.priorityScore,
      status: "queued",
      createdAt: existing?.createdAt ?? input.timestamp,
      updatedAt: input.timestamp
    } satisfies QueueEntry;
  });

  return {
    entries,
    occurrences: mergeOccurrencesWithSlots(normalizedOccurrences, slots, input.timestamp)
  };
}

export function findNextQueuedEntry(entries: QueueEntry[]): QueueEntry | null {
  return (
    [...entries]
      .filter((entry) => entry.status === "queued" && isQueueEntryReady(entry))
      .sort((left, right) => left.position - right.position)[0] ?? null
  );
}
