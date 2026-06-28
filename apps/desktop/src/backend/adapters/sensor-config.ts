/**
 * Reads the operator-facing sensor configuration out of `process.env` (populated from the
 * managed-settings env file — see {@link MANAGED_SETTINGS}). Kept as small pure parsers so the
 * adapter, the app service, and tests all derive the same values from one place, and so a saved
 * setting that is later reloaded is picked up on the next read rather than cached at startup.
 */

import { DEFAULT_WHEEL_CIRCUMFERENCE_METERS } from "@roller-rumble/shared/constants";
import type { RaceParticipant } from "@roller-rumble/shared/types";

export type SensorMode = "simulator" | "opensprints";

/** A forced firmware variant, or `auto` to detect it from the box's version reply. */
export type SensorProtocolSetting = "auto" | "ss-basic" | "basic" | "advanced";

/** A race lane a sensor port can be wired to, or `null` for an unused port. */
export type SensorLaneAssignment = RaceParticipant["lane"] | null;

const VALID_LANES: readonly RaceParticipant["lane"][] = ["left", "right", "solo"];

function read(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? "").trim();
}

/** Which sensor adapter to construct. Defaults to the simulator when unset/unknown. */
export function readSensorMode(env: NodeJS.ProcessEnv = process.env): SensorMode {
  return read(env, "ROLLER_RUMBLE_SENSOR_MODE") === "opensprints" ? "opensprints" : "simulator";
}

/** A specific serial port to bind, or `null` to auto-detect via the probe handshake. */
export function readSensorPortOverride(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = read(env, "ROLLER_RUMBLE_SENSOR_PORT");
  return value.length > 0 ? value : null;
}

const FORCEABLE_VARIANTS: readonly SensorProtocolSetting[] = ["ss-basic", "basic", "advanced"];

/**
 * The forced firmware variant, or `auto` (the default) to detect it from the box's version reply.
 * Forcing is only needed for the oldest `advanced` firmware, which can't announce itself.
 */
export function readSensorProtocol(env: NodeJS.ProcessEnv = process.env): SensorProtocolSetting {
  const value = read(env, "ROLLER_RUMBLE_SENSOR_PROTOCOL");
  return FORCEABLE_VARIANTS.find((variant) => variant === value) ?? "auto";
}

/**
 * The lane each sensor port (by index) feeds, parsed from a comma-separated list of
 * `left`/`right`/`solo`/`unused`. Returns `null` when unset or malformed so the session falls
 * back to its positional default rather than mapping ticks to the wrong racer.
 */
export function readSensorLaneAssignments(
  env: NodeJS.ProcessEnv = process.env
): SensorLaneAssignment[] | null {
  const raw = read(env, "ROLLER_RUMBLE_SENSOR_LANE_MAP");
  if (raw.length === 0) {
    return null;
  }

  const tokens = raw.split(",").map((token) => token.trim().toLowerCase());
  const assignments: SensorLaneAssignment[] = [];
  for (const token of tokens) {
    if (token === "unused" || token === "") {
      assignments.push(null);
      continue;
    }
    const lane = VALID_LANES.find((candidate) => candidate === token);
    if (!lane) {
      // One bad token means the whole map is untrustworthy; refuse it rather than guess.
      return null;
    }
    assignments.push(lane);
  }
  return assignments;
}

/**
 * Meters a bike travels per one roller revolution. Falls back to the shared default when unset
 * or not a positive number; a real value must be measured from the hardware or distances and
 * speeds will be wrong (see docs/opensprints-protocol.md).
 */
export function readSensorRolloutMeters(env: NodeJS.ProcessEnv = process.env): number {
  const raw = read(env, "ROLLER_RUMBLE_SENSOR_ROLLOUT_METERS");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WHEEL_CIRCUMFERENCE_METERS;
}
