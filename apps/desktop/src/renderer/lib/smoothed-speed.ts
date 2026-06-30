import type { RaceMetricsSnapshot } from "@roller-rumble/shared/types";

/**
 * Shared renderer-side smoothed-speed foundation for the projector race-display
 * companion cues — the leading-edge glow (#6) and the speed streaks (#9). See
 * ADR-0006: the glow PR established this seam first; the cues build on it.
 *
 * The snapshot's `currentSpeedKph` is recomputed only when a rotation tick lands,
 * so between ticks it *freezes* (and is zeroed at the finish) rather than falling
 * as a rider coasts or stops. This foundation turns that stair-stepped, frozen
 * value into a continuously smoothed estimate that decays toward zero when a lane
 * stops covering ground — the honest "are they still moving" signal every cue
 * needs. Calibration lives here so the shared smoothing/decay has one home.
 *
 * - `smoothingTauMs`: time constant of the speed EMA (~1.2s window) that
 *   suppresses pedal-stroke jitter without lagging real surges.
 * - `coastFadeMs`: how long a lane's speed estimate takes to fall to zero once
 *   its distance stops changing.
 * - `distanceEpsilonMeters`: how much ground a lane must cover between samples to
 *   count as "still moving" (guards against floating-point noise at a standstill).
 */
export const SMOOTHED_SPEED_CALIBRATION = {
  smoothingTauMs: 1200,
  coastFadeMs: 1000,
  distanceEpsilonMeters: 0.01
} as const;

export interface SmoothedSpeedLane {
  /** EMA of the (coast-decayed) speed estimate, in km/h — the cue input. */
  smoothedSpeedKph: number;
  /** The raw coast-decayed speed feeding the EMA this step, pre-smoothing. */
  rawSpeedKph: number;
  /** Distance at the last observation, to detect whether the rider is moving. */
  lastDistanceMeters: number;
  /** Speed reported at the last distance change, decayed while coasting. */
  lastMovingSpeedKph: number;
  /** Wall-clock time of the last distance change. */
  lastDistanceChangeMs: number;
  /** Wall-clock time of the last advance step for this lane. */
  lastUpdateMs: number;
}

export function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

/** EMA blend factor for an elapsed `dtMs` against time constant `tauMs`. */
export function emaAlpha(dtMs: number, tauMs: number): number {
  if (dtMs <= 0) {
    return 0;
  }
  return 1 - Math.exp(-dtMs / tauMs);
}

export function initSmoothedSpeedLane(
  speedKph: number,
  distanceMeters: number,
  nowMs: number
): SmoothedSpeedLane {
  return {
    smoothedSpeedKph: speedKph,
    rawSpeedKph: speedKph,
    lastDistanceMeters: distanceMeters,
    lastMovingSpeedKph: speedKph,
    lastDistanceChangeMs: nowMs,
    lastUpdateMs: nowMs
  };
}

/**
 * Advance a lane's smoothed speed by one step. `nowMs` is a parameter (not read
 * from a clock) so coast decay can be advanced deterministically by a React hook
 * on animation frames between snapshots.
 */
export function advanceSmoothedSpeedLane(
  prev: SmoothedSpeedLane,
  metric: RaceMetricsSnapshot,
  nowMs: number
): SmoothedSpeedLane {
  const frozenSpeedKph = Math.max(0, metric.currentSpeedKph);
  const distanceDelta = metric.distanceMeters - prev.lastDistanceMeters;

  let lastDistanceChangeMs = prev.lastDistanceChangeMs;
  let lastMovingSpeedKph = prev.lastMovingSpeedKph;
  let rawSpeedKph: number;

  if (distanceDelta > SMOOTHED_SPEED_CALIBRATION.distanceEpsilonMeters) {
    // The rider covered ground since we last looked: trust the reported speed.
    rawSpeedKph = frozenSpeedKph;
    lastDistanceChangeMs = nowMs;
    lastMovingSpeedKph = frozenSpeedKph;
  } else {
    // No new distance — currentSpeedKph is frozen (or zeroed at the finish), so
    // decay the last moving speed toward zero over coastFadeMs.
    const sinceChangeMs = nowMs - prev.lastDistanceChangeMs;
    const decay = clamp01(1 - sinceChangeMs / SMOOTHED_SPEED_CALIBRATION.coastFadeMs);
    rawSpeedKph = Math.min(prev.lastMovingSpeedKph, frozenSpeedKph) * decay;
  }

  const dtMs = Math.max(0, nowMs - prev.lastUpdateMs);
  const alpha = emaAlpha(dtMs, SMOOTHED_SPEED_CALIBRATION.smoothingTauMs);

  return {
    smoothedSpeedKph: prev.smoothedSpeedKph + (rawSpeedKph - prev.smoothedSpeedKph) * alpha,
    rawSpeedKph,
    lastDistanceMeters: metric.distanceMeters,
    lastMovingSpeedKph,
    lastDistanceChangeMs,
    lastUpdateMs: nowMs
  };
}
