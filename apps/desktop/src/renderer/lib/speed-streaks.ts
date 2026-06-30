import type { RaceMetricsSnapshot } from "@roller-rumble/shared/types";
import {
  type SmoothedSpeedLane,
  advanceSmoothedSpeedLane,
  clamp01,
  initSmoothedSpeedLane
} from "./smoothed-speed";

/**
 * Calibration for the speed streaks (issue #9), kept in one place so it can be
 * tuned against the real projector. Streaks are the companion cue that carries
 * *absolute* speed — the dimension the relative leading-edge glow (#6)
 * deliberately drops — so a steady-fast rider still visibly looks fast.
 *
 * - `topOfScaleKph`: the calibrated top of the absolute speed scale. Streak
 *   length/opacity grows linearly from zero at a standstill to a maximum at this
 *   speed, then clamps. A fixed km/h scale (not relative to the opponent) so the
 *   cue means the same thing in every race.
 */
export const SPEED_STREAK_CALIBRATION = {
  topOfScaleKph: 45
} as const;

export interface SpeedStreakState {
  lanes: Record<string, SmoothedSpeedLane>;
}

export interface SpeedStreakReduceResult {
  nextState: SpeedStreakState;
  intensityByRacerId: Record<string, number>;
}

export function createSpeedStreakState(): SpeedStreakState {
  return { lanes: {} };
}

/**
 * Map a smoothed absolute speed (km/h) to a streak intensity in [0, 1]. Linear
 * from zero at a standstill to full at {@link SPEED_STREAK_CALIBRATION.topOfScaleKph},
 * clamped above it. Pure and DOM-free — the unit-tested heart of the cue.
 */
export function streakIntensityForSpeed(smoothedSpeedKph: number): number {
  return clamp01(smoothedSpeedKph / SPEED_STREAK_CALIBRATION.topOfScaleKph);
}

/**
 * Pure reducer for the speed streaks. Given the previous state, the latest
 * per-lane metrics, and the current wall time, returns the next state and a
 * per-racer streak intensity in [0, 1] scaled to absolute speed.
 *
 * Each lane is independent — no opponent is needed, so this works identically in
 * head-to-head and solo races. The smoothed, coast-decayed speed comes from the
 * shared {@link advanceSmoothedSpeedLane} foundation (#6), so a coasting rider's
 * streaks fade to nothing as the estimate decays toward zero.
 *
 * `nowMs` is a parameter (not read from a clock) so coast decay can be advanced
 * deterministically by the React hook on animation frames between snapshots.
 */
export function reduceSpeedStreaks(
  prev: SpeedStreakState,
  metrics: RaceMetricsSnapshot[],
  nowMs: number
): SpeedStreakReduceResult {
  const lanes: Record<string, SmoothedSpeedLane> = {};
  const intensityByRacerId: Record<string, number> = {};

  for (const metric of metrics) {
    const lane =
      metric.racerId in prev.lanes
        ? advanceSmoothedSpeedLane(prev.lanes[metric.racerId], metric, nowMs)
        : initSmoothedSpeedLane(Math.max(0, metric.currentSpeedKph), metric.distanceMeters, nowMs);
    lanes[metric.racerId] = lane;
    intensityByRacerId[metric.racerId] = streakIntensityForSpeed(lane.smoothedSpeedKph);
  }

  return { nextState: { lanes }, intensityByRacerId };
}
