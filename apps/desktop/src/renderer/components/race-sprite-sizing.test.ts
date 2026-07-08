import { describe, expect, it } from "vitest";
import {
  computeMarkerSizeRem,
  MARKER_SIZE_HEIGHT_RATIO,
  MARKER_SIZE_MAX_REM,
  MARKER_SIZE_MIN_REM
} from "./race-sprite-sizing";

describe("computeMarkerSizeRem", () => {
  it("scales linearly with measured height inside the clamp range", () => {
    // 640px @16px root: 640 * 0.11 / 16 = 4.4rem, comfortably between the bounds.
    const heightPx = 640;
    const expected = (heightPx * MARKER_SIZE_HEIGHT_RATIO) / 16;
    expect(computeMarkerSizeRem(heightPx, 16)).toBeCloseTo(expected, 5);
    expect(expected).toBeGreaterThan(MARKER_SIZE_MIN_REM);
    expect(expected).toBeLessThan(MARKER_SIZE_MAX_REM);
  });

  it("clamps to the maximum for tall graphics", () => {
    expect(computeMarkerSizeRem(2000, 16)).toBe(MARKER_SIZE_MAX_REM);
  });

  it("clamps to the minimum for short graphics", () => {
    expect(computeMarkerSizeRem(200, 16)).toBe(MARKER_SIZE_MIN_REM);
  });

  it("is monotonic as the graphic grows", () => {
    let previous = computeMarkerSizeRem(100, 16);
    for (let height = 100; height <= 2000; height += 10) {
      const size = computeMarkerSizeRem(height, 16);
      expect(size).toBeGreaterThanOrEqual(previous);
      previous = size;
    }
  });

  it("has no visible jump at the old 720/820px window steps", () => {
    // The previous stepped scale changed abruptly at 720 and 820; the continuous
    // curve must move by a negligible amount across a single pixel there.
    for (const breakpoint of [720, 820]) {
      const below = computeMarkerSizeRem(breakpoint - 1, 16);
      const above = computeMarkerSizeRem(breakpoint + 1, 16);
      expect(Math.abs(above - below)).toBeLessThan(0.05);
    }
  });

  it("falls back to the maximum for degenerate inputs", () => {
    expect(computeMarkerSizeRem(0, 16)).toBe(MARKER_SIZE_MAX_REM);
    expect(computeMarkerSizeRem(-100, 16)).toBe(MARKER_SIZE_MAX_REM);
    expect(computeMarkerSizeRem(Number.NaN, 16)).toBe(MARKER_SIZE_MAX_REM);
    expect(computeMarkerSizeRem(640, 0)).toBe(MARKER_SIZE_MAX_REM);
  });

  it("respects a non-16px root font size", () => {
    // Same measured height, larger root font → fewer rem.
    expect(computeMarkerSizeRem(640, 20)).toBeCloseTo((640 * MARKER_SIZE_HEIGHT_RATIO) / 20, 5);
  });
});
