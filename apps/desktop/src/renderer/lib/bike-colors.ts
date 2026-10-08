/**
 * The colour each physical bike wears, so racers and the host can tell at a glance which bike a
 * name belongs on. The colour is the projector's lane identity colour — orange for the left bike,
 * purple for the right, swapped when the host flips the projector's lane colours to match the bikes
 * in the room (`raceDisplayLaneColorsFlipped`).
 */

import type {
  AppSnapshot,
  QueueEntry,
  RaceParticipant,
  RaceRecord,
  TournamentQueueEntry
} from "@roller-rumble/shared/types";
import { toBikeLane, type BikeLane } from "@roller-rumble/shared/race-lanes";

export type BikeColor = "orange" | "purple";

export function bikeColorForLane(
  lane: RaceParticipant["lane"],
  laneColorsFlipped: boolean
): BikeColor {
  const leftBikeColor: BikeColor = laneColorsFlipped ? "purple" : "orange";
  const rightBikeColor: BikeColor = laneColorsFlipped ? "orange" : "purple";
  return toBikeLane(lane) === "right" ? rightBikeColor : leftBikeColor;
}

/**
 * The bike colour for each racer slot of an upcoming race, or `null` for a slot no racer fills yet.
 * Pass `stagedRace` only when it is that race, already staged: its lanes then win, so a `lane swap`
 * shows before anyone rides. Otherwise the racers take the bikes staging will give them — first on
 * the left bike, second on the right.
 */
export function racerBikeColors(
  racerIds: readonly (string | null)[],
  stagedRace: Pick<RaceRecord, "participants"> | null,
  laneColorsFlipped: boolean
): (BikeColor | null)[] {
  return racerIds.map((racerId, index) => {
    if (!racerId) {
      return null;
    }
    const stagedLane = stagedRace?.participants.find(
      (participant) => participant.racerId === racerId
    )?.lane;
    const lane: BikeLane = stagedLane ? toBikeLane(stagedLane) : index === 0 ? "left" : "right";
    return bikeColorForLane(lane, laneColorsFlipped);
  });
}

/** A queue entry's bike colours; the staged race only counts when it was staged from this entry. */
export function queueEntryBikeColors(
  snapshot: AppSnapshot,
  entry: Pick<QueueEntry, "id" | "racerIds">
): (BikeColor | null)[] {
  const race = snapshot.raceProjection.race;
  return racerBikeColors(
    entry.racerIds,
    race?.queueEntryId === entry.id ? race : null,
    snapshot.settings.raceDisplayLaneColorsFlipped
  );
}

/**
 * A `tournament queue` race's bike colours. Only the entry that is `staging` is the current race,
 * so only it takes the staged race's lanes; the rest race slot A on the left bike, slot B right.
 */
export function tournamentEntryBikeColors(
  snapshot: AppSnapshot,
  entry: Pick<TournamentQueueEntry, "tournamentId" | "racerIds" | "status">
): (BikeColor | null)[] {
  const race = snapshot.raceProjection.race;
  const isStagedRace = entry.status === "staging" && race?.tournamentId === entry.tournamentId;
  return racerBikeColors(
    entry.racerIds,
    isStagedRace ? race : null,
    snapshot.settings.raceDisplayLaneColorsFlipped
  );
}
