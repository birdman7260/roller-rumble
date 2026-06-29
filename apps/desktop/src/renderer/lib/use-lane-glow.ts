import { useEffect, useRef, useState } from "react";
import type { RaceGlowMode, RaceMetricsSnapshot } from "@roller-rumble/shared/types";
import { type GlowState, createGlowState, reduceGlow } from "./glow-signal";

/** Don't re-render the race graphic for sub-perceptual intensity wobble. */
const MIN_INTENSITY_DELTA = 0.01;
/** Under reduced motion the glow is steady (on/off), not a continuous pulse. */
const REDUCED_MOTION_ON_THRESHOLD = 0.25;
const REDUCED_MOTION_STEADY_LEVEL = 0.8;

function quantizeForReducedMotion(
  intensityByRacerId: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [racerId, value] of Object.entries(intensityByRacerId)) {
    result[racerId] = value >= REDUCED_MOTION_ON_THRESHOLD ? REDUCED_MOTION_STEADY_LEVEL : 0;
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
 * Drives the projector leading-edge glow. Holds the pure {@link reduceGlow}
 * state and steps it on every animation frame using the latest snapshot
 * metrics, so coast decay advances toward dark even when a stopped lane stops
 * producing ticks. Returns a per-racer intensity in [0, 1].
 *
 * Honors `prefersReducedMotion` by holding the glow at a steady level instead
 * of letting it pulse. The hook is presentational; it is intentionally not unit
 * tested (the reducer it wraps is — see glow-signal.test.ts).
 */
export function useLaneGlow({
  metrics,
  mode,
  prefersReducedMotion
}: {
  metrics: RaceMetricsSnapshot[];
  mode: RaceGlowMode;
  prefersReducedMotion: boolean;
}): Record<string, number> {
  const stateRef = useRef<GlowState | null>(null);
  const metricsRef = useRef(metrics);
  const modeRef = useRef(mode);
  const reducedMotionRef = useRef(prefersReducedMotion);
  const intensityRef = useRef<Record<string, number>>({});
  const [intensity, setIntensity] = useState<Record<string, number>>({});

  // Keep the latest inputs in refs so the animation loop below reads current
  // values without resubscribing. Writing refs here (after render) rather than
  // during render keeps the loop's effect stable and avoids tearing.
  useEffect(() => {
    metricsRef.current = metrics;
    modeRef.current = mode;
    reducedMotionRef.current = prefersReducedMotion;
  });

  useEffect(() => {
    let frame = 0;
    let disposed = false;

    function tick(nowMs: number): void {
      const previousState = stateRef.current ?? createGlowState();
      const result = reduceGlow(previousState, metricsRef.current, modeRef.current, nowMs);
      stateRef.current = result.nextState;
      const next = reducedMotionRef.current
        ? quantizeForReducedMotion(result.intensityByRacerId)
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
