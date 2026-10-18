import { describe, expect, it } from "vitest";
import {
  applyRotationSample,
  createLaneTelemetryState,
  estimateWattage,
  finishLaneTelemetryState
} from "./metrics";

describe("metrics service", () => {
  it("calculates speed, distance, and average speed from rotation samples", () => {
    const state = createLaneTelemetryState(
      {
        racerId: "r1",
        lane: "solo"
      },
      0
    );

    const next = applyRotationSample(state, {
      timestampMs: 1000,
      deltaRotations: 5
    });

    expect(next.snapshot.distanceMeters).toBe(10.5);
    expect(next.snapshot.currentSpeedKph).toBeCloseTo(37.8, 1);
    expect(next.snapshot.averageSpeedKph).toBeCloseTo(37.8, 1);
    expect(next.snapshot.maxWattage).toBeGreaterThan(0);
  });

  it("derives roller RPM straight from rotation rate, independent of wheel size", () => {
    const state = createLaneTelemetryState({ racerId: "r1", lane: "solo" }, 0);

    // 5 rotations across 1s → 5 * 60 = 300 rpm, regardless of circumference.
    const withDefaultWheel = applyRotationSample(state, { timestampMs: 1000, deltaRotations: 5 });
    const withLargerWheel = applyRotationSample(
      state,
      { timestampMs: 1000, deltaRotations: 5 },
      3.4
    );

    expect(withDefaultWheel.snapshot.rpm).toBe(300);
    expect(withLargerWheel.snapshot.rpm).toBe(300);
    // Speed still scales with the wheel, so RPM is not merely a rescaled speed.
    expect(withLargerWheel.snapshot.currentSpeedKph).toBeGreaterThan(
      withDefaultWheel.snapshot.currentSpeedKph
    );
  });

  it("zeroes RPM when the lane finishes", () => {
    const state = createLaneTelemetryState({ racerId: "r1", lane: "solo" }, 0);
    const moving = applyRotationSample(state, { timestampMs: 1000, deltaRotations: 5 });

    expect(moving.snapshot.rpm).toBeGreaterThan(0);
    expect(finishLaneTelemetryState(moving, 2000).snapshot.rpm).toBe(0);
  });

  it("estimates higher wattage for higher speed", () => {
    expect(estimateWattage(20)).toBeLessThan(estimateWattage(40));
  });

  it("averages live speed over the trailing window instead of a single sample", () => {
    const tuning = { speedWindowMs: 1000 };
    let state = createLaneTelemetryState({ racerId: "r1", lane: "solo" }, 0);
    // Four 250ms samples alternating 1 and 2 rotations at 1m/rotation: 6m over 1s.
    for (const [timestampMs, deltaRotations] of [
      [250, 1],
      [500, 2],
      [750, 1],
      [1000, 2]
    ]) {
      state = applyRotationSample(state, { timestampMs, deltaRotations }, 1, tuning);
    }
    expect(state.snapshot.currentSpeedKph).toBeCloseTo(6 * 3.6, 2);
    expect(state.snapshot.rpm).toBe(360);

    // The next sample drops the oldest one out of the window: 2+1+2+1 = 6m over 250→1250.
    state = applyRotationSample(state, { timestampMs: 1250, deltaRotations: 1 }, 1, tuning);
    expect(state.snapshot.currentSpeedKph).toBeCloseTo(6 * 3.6, 2);
    // Top speed tracks the smoothed speed, not the noisy 2-rotation samples (8 m/s).
    expect(state.snapshot.topSpeedKph).toBeLessThan(8 * 3.6);
  });

  it("uses each sample alone when the window is zero", () => {
    let state = createLaneTelemetryState({ racerId: "r1", lane: "solo" }, 0);
    state = applyRotationSample(state, { timestampMs: 250, deltaRotations: 1 }, 1, {
      speedWindowMs: 0
    });
    state = applyRotationSample(state, { timestampMs: 500, deltaRotations: 2 }, 1, {
      speedWindowMs: 0
    });
    expect(state.snapshot.currentSpeedKph).toBeCloseTo(8 * 3.6, 2);
  });

  it("lets live speed fall to zero on samples with no rotations", () => {
    let state = createLaneTelemetryState({ racerId: "r1", lane: "solo" }, 0);
    state = applyRotationSample(state, { timestampMs: 250, deltaRotations: 2 }, 1, {
      speedWindowMs: 0
    });
    state = applyRotationSample(state, { timestampMs: 500, deltaRotations: 0 }, 1, {
      speedWindowMs: 0
    });
    expect(state.snapshot.currentSpeedKph).toBe(0);
    expect(state.snapshot.distanceMeters).toBe(2);
  });

  it("estimates wattage from a configurable model", () => {
    // 36 km/h = 10 m/s → 1 + 2×10 + 3×1000.
    expect(estimateWattage(36, { baseWatts: 1, linear: 2, cubic: 3 })).toBe(3021);
  });
});
