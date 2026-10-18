import { describe, expect, it } from "vitest";
import { DEFAULT_SPEED_WINDOW_MS } from "@roller-rumble/shared/constants";
import {
  DEFAULT_WATTAGE_MODEL,
  readFinishInterpolation,
  readSpeedWindowMs,
  readWattageModel
} from "./metrics-tuning";

describe("metrics-tuning", () => {
  it("falls back to the default speed window for blank or negative values", () => {
    expect(readSpeedWindowMs({})).toBe(DEFAULT_SPEED_WINDOW_MS);
    expect(readSpeedWindowMs({ ROLLER_RUMBLE_SPEED_WINDOW_MS: "-5" })).toBe(
      DEFAULT_SPEED_WINDOW_MS
    );
    // Zero is valid: speed from each sample alone, the pre-window behavior.
    expect(readSpeedWindowMs({ ROLLER_RUMBLE_SPEED_WINDOW_MS: "0" })).toBe(0);
    expect(readSpeedWindowMs({ ROLLER_RUMBLE_SPEED_WINDOW_MS: "1500.6" })).toBe(1501);
  });

  it("interpolates finish times unless explicitly turned off", () => {
    expect(readFinishInterpolation({})).toBe(true);
    expect(readFinishInterpolation({ ROLLER_RUMBLE_FINISH_INTERPOLATION: "on" })).toBe(true);
    expect(readFinishInterpolation({ ROLLER_RUMBLE_FINISH_INTERPOLATION: "off" })).toBe(false);
  });

  it("parses three wattage coefficients, or falls back to the default model", () => {
    expect(readWattageModel({})).toEqual(DEFAULT_WATTAGE_MODEL);
    expect(readWattageModel({ ROLLER_RUMBLE_WATTAGE_MODEL: "0, 10, 2" })).toEqual({
      baseWatts: 0,
      linear: 10,
      cubic: 2
    });
    expect(readWattageModel({ ROLLER_RUMBLE_WATTAGE_MODEL: "1,2" })).toEqual(DEFAULT_WATTAGE_MODEL);
    expect(readWattageModel({ ROLLER_RUMBLE_WATTAGE_MODEL: "1,x,3" })).toEqual(
      DEFAULT_WATTAGE_MODEL
    );
  });
});
