import { describe, expect, it } from "vitest";
import { placeFloatingMenu } from "./floating-menu";

const viewport = { top: 0, height: 800 };
const sizing = { gap: 6, edgeMargin: 8, maxHeight: 224 };

describe("placeFloatingMenu", () => {
  it("drops below the field, lined up with it, when there is room", () => {
    const placement = placeFloatingMenu({
      anchor: { top: 100, bottom: 140, left: 20, width: 300 },
      viewport,
      contentHeight: 120,
      sizing
    });

    expect(placement).toEqual({ top: 146, left: 20, width: 300, maxHeight: 224 });
  });

  it("opens upward, sitting right on top of the field, when it would run off the bottom", () => {
    const placement = placeFloatingMenu({
      anchor: { top: 700, bottom: 740, left: 20, width: 300 },
      viewport,
      contentHeight: 120,
      sizing
    });

    expect(placement).toEqual({ top: 574, left: 20, width: 300, maxHeight: 224 });
  });

  it("stays below a short list even when there is more room above", () => {
    const placement = placeFloatingMenu({
      anchor: { top: 600, bottom: 640, left: 20, width: 300 },
      viewport,
      contentHeight: 80,
      sizing
    });

    expect(placement).toEqual({ top: 646, left: 20, width: 300, maxHeight: 146 });
  });

  it("shrinks to the room left above a phone keyboard instead of hiding under it", () => {
    // The visual viewport is scrolled 200px down the page and cut to 300px tall by the keyboard.
    const placement = placeFloatingMenu({
      anchor: { top: 260, bottom: 300, left: 20, width: 300 },
      viewport: { top: 200, height: 300 },
      contentHeight: 400,
      sizing
    });

    expect(placement).toEqual({ top: 306, left: 20, width: 300, maxHeight: 186 });
  });

  it("never asks for a negative height when the visible area is smaller than the field", () => {
    const placement = placeFloatingMenu({
      anchor: { top: 5, bottom: 45, left: 20, width: 300 },
      viewport: { top: 0, height: 50 },
      contentHeight: 120,
      sizing
    });

    expect(placement.maxHeight).toBe(0);
  });
});
