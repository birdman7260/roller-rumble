import type { RaceGlowMode, RaceMetricsSnapshot } from "@roller-rumble/shared/types";
import {
  type SmoothedSpeedLane,
  advanceSmoothedSpeedLane,
  clamp01,
  emaAlpha,
  initSmoothedSpeedLane
} from "./smoothed-speed";

export type { RaceGlowMode };

/**
 * Calibration for the leading-edge glow, kept in one place so it can be tuned
 * against the real projector. See ADR-0006 and issue #6. The smoothing window
 * and coast fade live in the shared {@link SMOOTHED_SPEED_CALIBRATION}; what is
 * glow-specific stays here.
 *
 * - `referenceTauMs`: slower EMA that stands in for "the rider's speed a moment
 *   ago"; Surge brightness is the rectified gap between it and the fast EMA.
 * - `rivalryFullDeltaKph` / `surgeFullDeltaKph`: the speed difference that maps
 *   to full (1.0) intensity for each mode.
 */
export const GLOW_CALIBRATION = {
  referenceTauMs: 2600,
  rivalryFullDeltaKph: 6,
  surgeFullDeltaKph: 4
} as const;

export interface LaneGlowState extends SmoothedSpeedLane {
  /** Slow EMA used as the "moment ago" reference for Surge. */
  referenceSpeedKph: number;
}

export interface GlowState {
  lanes: Record<string, LaneGlowState>;
}

export interface GlowReduceResult {
  nextState: GlowState;
  intensityByRacerId: Record<string, number>;
}

export function createGlowState(): GlowState {
  return { lanes: {} };
}

function initLane(speedKph: number, distanceMeters: number, nowMs: number): LaneGlowState {
  return {
    ...initSmoothedSpeedLane(speedKph, distanceMeters, nowMs),
    referenceSpeedKph: speedKph
  };
}

function advanceLane(
  prev: LaneGlowState,
  metric: RaceMetricsSnapshot,
  nowMs: number
): LaneGlowState {
  // The slow reference EMA runs over the same raw, coast-decayed speed the shared
  // foundation smooths; compute its blend from the pre-advance timing so it stays
  // identical to the original glow math.
  const refAlpha = emaAlpha(
    Math.max(0, nowMs - prev.lastUpdateMs),
    GLOW_CALIBRATION.referenceTauMs
  );
  const next = advanceSmoothedSpeedLane(prev, metric, nowMs);

  return {
    ...next,
    referenceSpeedKph:
      prev.referenceSpeedKph + (next.rawSpeedKph - prev.referenceSpeedKph) * refAlpha
  };
}

function surgeIntensity(lane: LaneGlowState): number {
  const accelerationKph = lane.smoothedSpeedKph - lane.referenceSpeedKph;
  return clamp01(Math.max(0, accelerationKph) / GLOW_CALIBRATION.surgeFullDeltaKph);
}

function rivalryIntensity(lane: LaneGlowState, fastestOpponentKph: number): number {
  const leadKph = lane.smoothedSpeedKph - fastestOpponentKph;
  return clamp01(Math.max(0, leadKph) / GLOW_CALIBRATION.rivalryFullDeltaKph);
}

/**
 * Pure reducer for the leading-edge glow. Given the previous glow state, the
 * latest per-lane metrics, the operator's glow mode, and the current wall time,
 * returns the next state and a per-racer intensity in [0, 1].
 *
 * `nowMs` is a parameter (not read from a clock) so coast decay can be advanced
 * deterministically by the React hook on animation frames between snapshots.
 */
export function reduceGlow(
  prev: GlowState,
  metrics: RaceMetricsSnapshot[],
  mode: RaceGlowMode,
  nowMs: number
): GlowReduceResult {
  const lanes: Record<string, LaneGlowState> = {};

  for (const metric of metrics) {
    lanes[metric.racerId] =
      metric.racerId in prev.lanes
        ? advanceLane(prev.lanes[metric.racerId], metric, nowMs)
        : initLane(Math.max(0, metric.currentSpeedKph), metric.distanceMeters, nowMs);
  }

  // Rivalry needs an opponent; a solo race always falls back to Surge.
  const useSurge = mode === "surge" || metrics.length < 2;

  const intensityByRacerId: Record<string, number> = {};
  for (const metric of metrics) {
    const lane = lanes[metric.racerId];
    if (useSurge) {
      intensityByRacerId[metric.racerId] = surgeIntensity(lane);
      continue;
    }

    let fastestOpponentKph = 0;
    for (const other of metrics) {
      if (other.racerId === metric.racerId) {
        continue;
      }
      fastestOpponentKph = Math.max(fastestOpponentKph, lanes[other.racerId].smoothedSpeedKph);
    }
    intensityByRacerId[metric.racerId] = rivalryIntensity(lane, fastestOpponentKph);
  }

  return { nextState: { lanes }, intensityByRacerId };
}
