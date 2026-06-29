import type { RaceGlowMode, RaceMetricsSnapshot } from "@roller-rumble/shared/types";

export type { RaceGlowMode };

/**
 * Calibration for the leading-edge glow, kept in one place so it can be tuned
 * against the real projector. See ADR-0006 and issue #6.
 *
 * - `smoothingTauMs`: time constant of the fast speed EMA (~1.2s window) that
 *   suppresses pedal-stroke jitter without lagging real surges.
 * - `referenceTauMs`: slower EMA that stands in for "the rider's speed a moment
 *   ago"; Surge brightness is the rectified gap between the two.
 * - `coastFadeMs`: how long a lane's speed estimate takes to fall to dark once
 *   its distance stops changing (currentSpeedKph freezes between ticks).
 * - `rivalryFullDeltaKph` / `surgeFullDeltaKph`: the speed difference that maps
 *   to full (1.0) intensity for each mode.
 */
export const GLOW_CALIBRATION = {
  smoothingTauMs: 1200,
  referenceTauMs: 2600,
  coastFadeMs: 1000,
  rivalryFullDeltaKph: 6,
  surgeFullDeltaKph: 4,
  distanceEpsilonMeters: 0.01
} as const;

export interface LaneGlowState {
  /** Fast EMA of the (coast-decayed) speed estimate, in km/h. */
  smoothedSpeedKph: number;
  /** Slow EMA used as the "moment ago" reference for Surge. */
  referenceSpeedKph: number;
  /** Distance at the last observation, to detect whether the rider is moving. */
  lastDistanceMeters: number;
  /** Speed reported at the last distance change, decayed while coasting. */
  lastMovingSpeedKph: number;
  /** Wall-clock time of the last distance change. */
  lastDistanceChangeMs: number;
  /** Wall-clock time of the last reduce step for this lane. */
  lastUpdateMs: number;
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

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

/** EMA blend factor for an elapsed `dtMs` against time constant `tauMs`. */
function emaAlpha(dtMs: number, tauMs: number): number {
  if (dtMs <= 0) {
    return 0;
  }
  return 1 - Math.exp(-dtMs / tauMs);
}

function initLane(speedKph: number, distanceMeters: number, nowMs: number): LaneGlowState {
  return {
    smoothedSpeedKph: speedKph,
    referenceSpeedKph: speedKph,
    lastDistanceMeters: distanceMeters,
    lastMovingSpeedKph: speedKph,
    lastDistanceChangeMs: nowMs,
    lastUpdateMs: nowMs
  };
}

function advanceLane(
  prev: LaneGlowState,
  metric: RaceMetricsSnapshot,
  nowMs: number
): LaneGlowState {
  const frozenSpeedKph = Math.max(0, metric.currentSpeedKph);
  const distanceDelta = metric.distanceMeters - prev.lastDistanceMeters;

  let lastDistanceChangeMs = prev.lastDistanceChangeMs;
  let lastMovingSpeedKph = prev.lastMovingSpeedKph;
  let rawSpeedKph: number;

  if (distanceDelta > GLOW_CALIBRATION.distanceEpsilonMeters) {
    // The rider covered ground since we last looked: trust the reported speed.
    rawSpeedKph = frozenSpeedKph;
    lastDistanceChangeMs = nowMs;
    lastMovingSpeedKph = frozenSpeedKph;
  } else {
    // No new distance — currentSpeedKph is frozen (or zeroed at the finish), so
    // decay the last moving speed toward dark over coastFadeMs.
    const sinceChangeMs = nowMs - prev.lastDistanceChangeMs;
    const decay = clamp01(1 - sinceChangeMs / GLOW_CALIBRATION.coastFadeMs);
    rawSpeedKph = Math.min(prev.lastMovingSpeedKph, frozenSpeedKph) * decay;
  }

  const dtMs = Math.max(0, nowMs - prev.lastUpdateMs);
  const fastAlpha = emaAlpha(dtMs, GLOW_CALIBRATION.smoothingTauMs);
  const refAlpha = emaAlpha(dtMs, GLOW_CALIBRATION.referenceTauMs);

  return {
    smoothedSpeedKph: prev.smoothedSpeedKph + (rawSpeedKph - prev.smoothedSpeedKph) * fastAlpha,
    referenceSpeedKph: prev.referenceSpeedKph + (rawSpeedKph - prev.referenceSpeedKph) * refAlpha,
    lastDistanceMeters: metric.distanceMeters,
    lastMovingSpeedKph,
    lastDistanceChangeMs,
    lastUpdateMs: nowMs
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
