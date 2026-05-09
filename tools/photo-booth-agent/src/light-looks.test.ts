import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIGHT_LOOK,
  LIGHT_LOOKS,
  resolveDefaultLightSelection,
  resolveLightLookSelection,
  validateLightLookManifest
} from "./light-looks";

describe("LED look manifest", () => {
  it("defines one valid default manifest with unique ids and usable WLED values", () => {
    expect(validateLightLookManifest()).toEqual([]);
    expect(LIGHT_LOOKS.length).toBeGreaterThanOrEqual(7);
    expect(DEFAULT_LIGHT_LOOK.id).toBe("solid-white");
  });

  it("resolves a look id into a cloned light selection", () => {
    const first = resolveLightLookSelection("solid-red");
    const second = resolveLightLookSelection("solid-red");

    expect(first).toMatchObject({ lookId: "solid-red", label: "Solid red" });
    expect(first).not.toBe(second);
  });

  it("rejects unknown or missing look ids", () => {
    expect(() => resolveLightLookSelection("unknown-look")).toThrow(/Unknown LED look/);
    expect(() => resolveLightLookSelection(undefined)).toThrow(/Choose an LED look/);
  });

  it("uses the configured default look when provided", () => {
    expect(resolveDefaultLightSelection("chasing-rainbow").lookId).toBe("chasing-rainbow");
    expect(resolveDefaultLightSelection().lookId).toBe(DEFAULT_LIGHT_LOOK.id);
  });
});
