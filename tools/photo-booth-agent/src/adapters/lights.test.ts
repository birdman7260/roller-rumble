import { describe, expect, it } from "vitest";
import { LIGHT_LOOKS } from "../light-looks";
import { buildWledSelectionPayload, hsbToRgb } from "./lights";

describe("WLED light payloads", () => {
  it("converts HSB selections to RGB values", () => {
    expect(hsbToRgb(0, 100, 255)).toEqual([255, 0, 0]);
    expect(hsbToRgb(120, 100, 255)).toEqual([0, 255, 0]);
    expect(hsbToRgb(240, 100, 255)).toEqual([0, 0, 255]);
  });

  it("builds JSON API payloads for selected looks", () => {
    expect(
      buildWledSelectionPayload({
        lookId: "solid-blue",
        hue: 210,
        saturation: 80,
        brightness: 200,
        effectId: 9,
        effectSpeed: 180,
        effectIntensity: 90,
        paletteId: 3,
        label: "Blue"
      })
    ).toMatchObject({
      on: true,
      bri: 200,
      seg: [{ fx: 9, sx: 180, ix: 90, pal: 3 }]
    });
  });

  it("builds WLED payloads for every preset LED look", () => {
    for (const look of LIGHT_LOOKS) {
      const payload = buildWledSelectionPayload(look.selection);

      expect(payload).toMatchObject({ on: true, bri: look.selection.brightness });
    }
  });
});
