import type {
  AppSnapshot,
  QueueEntry,
  RaceParticipant,
  RaceRecord,
  RacerSummary
} from "@roller-rumble/shared/types";

/**
 * A racer on the projector, carrying the bike they are on. The lane travels with the entry rather
 * than being inferred from lineup position so a `lane swap` moves the rider's lane colour with them
 * — which is the only way a solo swap is visible at all, since a lone rider is always slot zero.
 */
export interface ProjectorParticipantEntry extends RacerSummary {
  lane: RaceParticipant["lane"];
}

export function resolveRacerName(
  snapshot: AppSnapshot,
  racerId?: string | null,
  fallback = "Unknown"
): string {
  if (!racerId) {
    return fallback;
  }

  return snapshot.racers.find((entry) => entry.racer.id === racerId)?.racer.displayName ?? fallback;
}

export function formatRacerNames(snapshot: AppSnapshot, racerIds: string[]): string {
  return racerIds.map((racerId) => resolveRacerName(snapshot, racerId)).join(" vs ");
}

export function describeQueueEntry(entry: QueueEntry): string {
  if (entry.lockType === "challenge") {
    return "Challenge match";
  }

  if (entry.requestedType === "auto-match" && entry.racerIds.length === 1) {
    return "Waiting for head-to-head opponent";
  }

  if (entry.requestedType === "solo") {
    return "Solo run";
  }

  return "Head-to-head";
}

// A racer can only leave a spot that is still `queued`; a race that is already
// staging or live is the host's to unwind (issue #28).
export function isLeavableByRacer(entry: QueueEntry, selectedRacerId: string): boolean {
  return (
    entry.status === "queued" &&
    Boolean(selectedRacerId) &&
    entry.racerIds.includes(selectedRacerId)
  );
}

export function buildParticipantEntries(
  snapshot: AppSnapshot,
  race: RaceRecord | null = snapshot.raceProjection.race
): ProjectorParticipantEntry[] {
  if (!race) {
    return [];
  }

  return race.participants
    .map((participant) => {
      const entry = snapshot.racers.find((candidate) => candidate.racer.id === participant.racerId);
      return entry ? { ...entry, lane: participant.lane } : null;
    })
    .filter((entry): entry is ProjectorParticipantEntry => entry != null);
}
