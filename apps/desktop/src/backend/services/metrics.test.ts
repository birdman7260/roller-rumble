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
});
