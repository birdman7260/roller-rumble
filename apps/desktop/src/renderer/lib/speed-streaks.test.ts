import { describe, expect, it } from "vitest";
import type { RaceMetricsSnapshot } from "@roller-rumble/shared/types";
import {
  SPEED_STREAK_CALIBRATION,
  type SpeedStreakState,
  createSpeedStreakState,
  reduceSpeedStreaks,
  streakIntensityForSpeed
} from "./speed-streaks";

function metric(
  racerId: string,
  distanceMeters: number,
  currentSpeedKph: number,
  lane: RaceMetricsSnapshot["lane"] = "solo"
): RaceMetricsSnapshot {
  return {
    racerId,
    lane,
    rotationCount: 0,
    elapsedMs: 0,
    distanceMeters,
    rpm: 0,
    currentSpeedKph,
    topSpeedKph: currentSpeedKph,
    averageSpeedKph: currentSpeedKph,
    wattage: 0,
    maxWattage: 0,
    finishedAtMs: null
  };
}

interface Step {
  metrics: RaceMetricsSnapshot[];
  nowMs: number;
}

function run(
  steps: Step[],
  initial: SpeedStreakState = createSpeedStreakState()
): { state: SpeedStreakState; intensity: Record<string, number> } {
  let state = initial;
  let intensity: Record<string, number> = {};
  for (const step of steps) {
    const result = reduceSpeedStreaks(state, step.metrics, step.nowMs);
    state = result.nextState;
    intensity = result.intensityByRacerId;
  }
  return { state, intensity };
}

/** Steady cruise at `speedKph` for one solo lane, sampled every `dtMs`. */
function cruiseSteps(speedKph: number, count: number, dtMs = 250, startMs = 0): Step[] {
  const distancePerStepMeters = (speedKph / 3.6) * (dtMs / 1000);
  return Array.from({ length: count }, (_unused, index) => ({
    metrics: [metric("solo", distancePerStepMeters * (index + 1), speedKph)],
    nowMs: startMs + dtMs * (index + 1)
  }));
}

describe("streakIntensityForSpeed — absolute-speed mapping", () => {
  it("is zero at a standstill", () => {
    expect(streakIntensityForSpeed(0)).toBe(0);
  });

  it("rises monotonically with speed below the top of scale", () => {
    const slow = streakIntensityForSpeed(10);
    const medium = streakIntensityForSpeed(20);
    const fast = streakIntensityForSpeed(35);
    expect(slow).toBeGreaterThan(0);
    expect(medium).toBeGreaterThan(slow);
    expect(fast).toBeGreaterThan(medium);
  });

  it("reaches full intensity at the top-of-scale speed and clamps beyond it", () => {
    expect(streakIntensityForSpeed(SPEED_STREAK_CALIBRATION.topOfScaleKph)).toBe(1);
    expect(streakIntensityForSpeed(SPEED_STREAK_CALIBRATION.topOfScaleKph + 30)).toBe(1);
  });

  it("never goes negative for a nonsensical negative speed", () => {
    expect(streakIntensityForSpeed(-5)).toBe(0);
  });
});

describe("speed streak reducer", () => {
  it("gives a faster steady rider a stronger streak than a slower one", () => {
    const slow = run(cruiseSteps(12, 12)).intensity.solo;
    const fast = run(cruiseSteps(34, 12)).intensity.solo;
    expect(fast).toBeGreaterThan(slow);
  });

  it("gives a standstill no streak", () => {
    const { intensity } = run([
      { metrics: [metric("solo", 0, 0)], nowMs: 0 },
      { metrics: [metric("solo", 0, 0)], nowMs: 250 },
      { metrics: [metric("solo", 0, 0)], nowMs: 500 }
    ]);
    expect(intensity.solo).toBe(0);
  });

  it("decays a coasting rider's streak toward none over the fade window", () => {
    // Build up a streak at a strong cruise, then stop sending fresh distance.
    const cruise = cruiseSteps(34, 12);
    const lastMs = cruise[cruise.length - 1].nowMs;
    const cruised = run(cruise);
    expect(cruised.intensity.solo).toBeGreaterThan(0.4);

    const lastDistance = (34 / 3.6) * (250 / 1000) * cruise.length;
    // Same frozen distance, sampled finely the way the rAF hook advances coast
    // decay between snapshots: the rider has stopped covering ground. The streak
    // should fall monotonically toward none across the fade.
    let state = cruised.state;
    let previous = cruised.intensity.solo;
    for (let index = 1; index <= 30; index += 1) {
      const result = reduceSpeedStreaks(
        state,
        [metric("solo", lastDistance, 34)],
        lastMs + index * 100
      );
      state = result.nextState;
      const current = result.intensityByRacerId.solo;
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
    // Faded to a small fraction of the cruising streak — toward none, not held.
    expect(previous).toBeLessThan(cruised.intensity.solo * 0.2);
  });

  it("scales each rider independently with no opponent needed (solo race)", () => {
    const { intensity } = run(cruiseSteps(30, 12));
    expect(Object.keys(intensity)).toEqual(["solo"]);
    expect(intensity.solo).toBeGreaterThan(0);
  });

  it("tracks two lanes independently by their own absolute speed", () => {
    const dtMs = 250;
    const steps: Step[] = Array.from({ length: 12 }, (_unused, index) => {
      const fastDistance = (34 / 3.6) * (dtMs / 1000) * (index + 1);
      const slowDistance = (12 / 3.6) * (dtMs / 1000) * (index + 1);
      return {
        metrics: [
          metric("fast", fastDistance, 34, "left"),
          metric("slow", slowDistance, 12, "right")
        ],
        nowMs: dtMs * (index + 1)
      };
    });
    const { intensity } = run(steps);
    expect(intensity.fast).toBeGreaterThan(intensity.slow);
    expect(intensity.slow).toBeGreaterThan(0);
  });
});
