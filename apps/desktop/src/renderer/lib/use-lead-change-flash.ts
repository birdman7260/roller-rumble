import { useEffect, useRef, useState } from "react";
import type { RaceMetricsSnapshot } from "@roller-rumble/shared/types";
import { type LeadChangeState, createLeadChangeState, reduceLeadChange } from "./lead-change";

/** Don't re-render the race graphic for sub-perceptual envelope wobble. */
const MIN_FLASH_DELTA = 0.01;
/** Under reduced motion the burst is softened to a dimmer, gentle fade. */
const REDUCED_MOTION_PEAK = 0.55;

function softenForReducedMotion(flashByRacerId: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [racerId, value] of Object.entries(flashByRacerId)) {
    result[racerId] = value * REDUCED_MOTION_PEAK;
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
    if (!(key in prev) || Math.abs(prev[key] - next[key]) >= MIN_FLASH_DELTA) {
      return true;
    }
  }
  return false;
}

/**
 * Drives the projector lead-change flash. Holds the pure {@link reduceLeadChange}
 * state and steps it on every animation frame using the latest snapshot metrics,
 * so the brief burst fades smoothly between snapshots. Returns a per-racer flash
 * intensity in [0, 1].
 *
 * Honors `prefersReducedMotion` by softening the burst to a dimmer opacity fade
 * (the hard scale punch is dropped in CSS). The hook is presentational; it is
 * intentionally not unit tested (the reducer it wraps is — see lead-change.test.ts).
 */
export function useLeadChangeFlash({
  metrics,
  prefersReducedMotion
}: {
  metrics: RaceMetricsSnapshot[];
  prefersReducedMotion: boolean;
}): Record<string, number> {
  const stateRef = useRef<LeadChangeState | null>(null);
  const metricsRef = useRef(metrics);
  const reducedMotionRef = useRef(prefersReducedMotion);
  const flashRef = useRef<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, number>>({});

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
      const previousState = stateRef.current ?? createLeadChangeState();
      const result = reduceLeadChange(previousState, metricsRef.current, nowMs);
      stateRef.current = result.nextState;
      const next = reducedMotionRef.current
        ? softenForReducedMotion(result.flashByRacerId)
        : result.flashByRacerId;

      if (hasMeaningfulChange(flashRef.current, next)) {
        flashRef.current = next;
        setFlash(next);
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

  return flash;
}
