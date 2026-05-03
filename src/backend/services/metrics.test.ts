import { describe, expect, it } from "vitest";
import { applyRotationSample, createLaneTelemetryState, estimateWattage } from "./metrics";

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

  it("estimates higher wattage for higher speed", () => {
    expect(estimateWattage(20)).toBeLessThan(estimateWattage(40));
  });
});
