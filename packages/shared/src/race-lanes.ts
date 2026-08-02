/**
 * The rule behind the `lane swap` — the host correction that reassigns which physical bike each
 * racer in a staged race is on (see CONTEXT.md `lane swap`, docs/adr/0019-host-assigned-lane-swap.md).
 *
 * Nobody is assigned a bike at a walk-up event; riders mount whichever they like, and rotation ticks
 * alone can never say who is who. The host sets the lineup and repairs it here when the riders
 * picked the other way round. Kept pure and in `shared` so the backend can apply it and the admin
 * surface can name the destination bike on the button.
 */

import type { RaceParticipant, RaceRecord } from "./types";

/** A lane that names a real bike. `solo` is the legacy third value and names no bike. */
export type BikeLane = Extract<RaceParticipant["lane"], "left" | "right">;

/**
 * Sort key that keeps a lineup ordered left-then-right, matching the box's port order and the
 * projector's lane order. Shared so the lineup a swap produces and the order the results overlay
 * renders can never drift apart.
 */
export const LANE_DISPLAY_ORDER: Record<RaceParticipant["lane"], number> = {
  left: 0,
  solo: 0,
  right: 1
};

/**
 * Race states a `lane swap` is allowed in — before the box is armed and before any ticks land. Past
 * these the host resets the race to staged first (see ADR 0019). Shared so the admin surface offers
 * the control on exactly the states the backend will accept.
 */
export const LANE_SWAP_RACE_STATES: readonly RaceRecord["state"][] = ["scheduled", "staging"];

/**
 * Which real bike a lane names. A legacy `solo` lane names none, so it counts as the left one —
 * the same assumption the sensor's default lane map makes, keeping one answer across the app.
 */
export function toBikeLane(lane: RaceParticipant["lane"]): BikeLane {
  return lane === "right" ? "right" : "left";
}

/**
 * The other bike. A legacy `solo` lane counts as the left one and so swaps to the right, which puts
 * an old-style solo race on a real bike rather than leaving it pointing nowhere.
 */
export function oppositeBikeLane(lane: RaceParticipant["lane"]): BikeLane {
  return toBikeLane(lane) === "right" ? "left" : "right";
}

/**
 * Apply a `lane swap` to a lineup: every racer moves to the other bike. For a head-to-head race that
 * exchanges the two racers; for a solo race it moves the lone rider across. The result is re-sorted
 * left-then-right so consumers that read the lineup positionally — the sensor session's default lane
 * map, the projector's lane order — see the same order before and after.
 */
export function swapParticipantLanes(participants: RaceParticipant[]): RaceParticipant[] {
  return participants
    .map((participant) => ({ ...participant, lane: oppositeBikeLane(participant.lane) }))
    .sort((first, second) => LANE_DISPLAY_ORDER[first.lane] - LANE_DISPLAY_ORDER[second.lane]);
}

/** Whether a race is still early enough for the host to reassign bikes. */
export function canSwapRaceLanes(race: Pick<RaceRecord, "state"> | null): boolean {
  return race != null && LANE_SWAP_RACE_STATES.includes(race.state);
}
