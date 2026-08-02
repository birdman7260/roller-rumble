/**
 * How the admin surface offers the `lane swap` — the host correction that reassigns which physical
 * bike each racer in a staged race is on (see CONTEXT.md `lane swap`,
 * docs/adr/0019-host-assigned-lane-swap.md). The swap rule itself, and the states it is allowed in,
 * live in `@roller-rumble/shared/race-lanes` so the backend and this surface cannot disagree.
 */

import type { RaceParticipant } from "@roller-rumble/shared/types";
import { oppositeBikeLane, toBikeLane } from "@roller-rumble/shared/race-lanes";

/** The single keystroke that applies a `lane swap` from anywhere on the admin surface. */
export const LANE_SWAP_SHORTCUT_KEY = "s";

/**
 * Name the swap after what it does to this lineup. "Swap Bikes" reads wrong for one rider, and the
 * operator is glancing at a button mid-event — naming the destination bike is faster to confirm
 * against what they can see in front of them.
 */
export function describeLaneSwap(participants: RaceParticipant[]): string {
  if (participants.length !== 1) {
    return "Swap Bikes";
  }
  return oppositeBikeLane(participants[0].lane) === "right"
    ? "Move To Right Bike"
    : "Move To Left Bike";
}

/** Which bike a racer is on, in the words the operator uses when looking at the two rollers. */
export function describeBike(lane: RaceParticipant["lane"]): string {
  return toBikeLane(lane) === "right" ? "Right bike" : "Left bike";
}
