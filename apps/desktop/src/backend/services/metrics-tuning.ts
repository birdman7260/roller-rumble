/**
 * The operator-tunable knobs that turn rotation samples into the racer-facing numbers — live speed
 * smoothing, finish-time interpolation, and the wattage estimate. Kept as small pure readers (like
 * `finish-budget.ts`) so `ActiveRace` and tests derive the same values from one place, and so a
 * saved setting is picked up by the next race rather than cached at startup.
 */

import { DEFAULT_SPEED_WINDOW_MS } from "@roller-rumble/shared/constants";

/** `watts = baseWatts + linear × v + cubic × v³`, with `v` in meters per second. */
export interface WattageModel {
  baseWatts: number;
  linear: number;
  cubic: number;
}

/** A rough rolling-resistance + aero curve; not a power meter, just a plausible crowd-pleaser. */
export const DEFAULT_WATTAGE_MODEL: WattageModel = { baseWatts: 12, linear: 18, cubic: 1.8 };

function read(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? "").trim();
}

/**
 * The trailing window, in ms, that live speed and cadence are averaged over. Falls back to
 * {@link DEFAULT_SPEED_WINDOW_MS} when unset or negative; 0 means each sample alone.
 */
export function readSpeedWindowMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseFloat(read(env, "ROLLER_RUMBLE_SPEED_WINDOW_MS"));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : DEFAULT_SPEED_WINDOW_MS;
}

/**
 * Whether a finish time is interpolated to the instant the rider actually reached the line within
 * the sample that carried them over it, rather than snapped to that sample's timestamp. On by
 * default: without it every finish lands on the box's 250ms sample grid, and two riders who cross in
 * the same sample tie — with the first sensor port processed winning the tie.
 */
export function readFinishInterpolation(env: NodeJS.ProcessEnv = process.env): boolean {
  return read(env, "ROLLER_RUMBLE_FINISH_INTERPOLATION") !== "off";
}

/**
 * The wattage model's three coefficients from a `base,linear,cubic` list. Falls back to
 * {@link DEFAULT_WATTAGE_MODEL} unless exactly three finite numbers are given.
 */
export function readWattageModel(env: NodeJS.ProcessEnv = process.env): WattageModel {
  const raw = read(env, "ROLLER_RUMBLE_WATTAGE_MODEL");
  if (raw.length === 0) {
    return DEFAULT_WATTAGE_MODEL;
  }
  const parts = raw.split(",").map((part) => (part.trim() === "" ? Number.NaN : Number(part)));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return DEFAULT_WATTAGE_MODEL;
  }
  const [baseWatts, linear, cubic] = parts;
  return { baseWatts, linear, cubic };
}
