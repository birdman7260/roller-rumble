import { useEffect, useRef, useState } from "react";
import type { RaceMetricsSnapshot } from "@roller-rumble/shared/types";
import { type SpeedStreakState, createSpeedStreakState, reduceSpeedStreaks } from "./speed-streaks";

/** Don't re-render the race graphic for sub-perceptual intensity wobble. */
const MIN_INTENSITY_DELTA = 0.01;
/**
 * Streaks are literally motion lines, so reduced motion minimizes them: the
 * absolute-speed read is kept (a fast rider still trails *something*) but at a
 * heavily damped length/opacity rather than full streaming lines.
 */
const REDUCED_MOTION_STREAK_SCALE = 0.25;

function minimizeForReducedMotion(
  intensityByRacerId: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [racerId, value] of Object.entries(intensityByRacerId)) {
    result[racerId] = value * REDUCED_MOTION_STREAK_SCALE;
  }
  return result;
}

function hasMeaningfulChange(prev: Record<string, number>, next: Record<string, number>): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) {
    return true;
  }
  for (const key of nextKeys) {
    if (!(key in prev) || Math.abs(prev[key] - next[key]) >= MIN_INTENSITY_DELTA) {
      return true;
    }
  }
  return false;
}

/**
 * Drives the projector speed streaks. Holds the pure {@link reduceSpeedStreaks}
 * state and steps it on every animation frame using the latest snapshot metrics,
 * so coast decay advances toward none even when a stopped lane stops producing
 * ticks. Returns a per-racer streak intensity in [0, 1] scaled to absolute speed.
 *
 * Honors `prefersReducedMotion` by minimizing the streaks (heavily damped) rather
 * than letting them stream at full length. The hook is presentational; it is
 * intentionally not unit tested (the reducer it wraps is — see speed-streaks.test.ts).
 */
export function useSpeedStreaks({
  metrics,
  prefersReducedMotion
}: {
  metrics: RaceMetricsSnapshot[];
  prefersReducedMotion: boolean;
}): Record<string, number> {
  const stateRef = useRef<SpeedStreakState | null>(null);
  const metricsRef = useRef(metrics);
  const reducedMotionRef = useRef(prefersReducedMotion);
  const intensityRef = useRef<Record<string, number>>({});
  const [intensity, setIntensity] = useState<Record<string, number>>({});

  // Keep the latest inputs in refs so the animation loop reads current values
  // without resubscribing, mirroring useLaneGlow.
  useEffect(() => {
    metricsRef.current = metrics;
    reducedMotionRef.current = prefersReducedMotion;
  });

  useEffect(() => {
    let frame = 0;
    let disposed = false;

    function tick(nowMs: number): void {
      const previousState = stateRef.current ?? createSpeedStreakState();
      const result = reduceSpeedStreaks(previousState, metricsRef.current, nowMs);
      stateRef.current = result.nextState;
      const next = reducedMotionRef.current
        ? minimizeForReducedMotion(result.intensityByRacerId)
        : result.intensityByRacerId;

      if (hasMeaningfulChange(intensityRef.current, next)) {
        intensityRef.current = next;
        setIntensity(next);
      }

      if (!disposed) {
        frame = window.requestAnimationFrame(tick);
      }
    }

    frame = window.requestAnimationFrame(tick);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return intensity;
}
