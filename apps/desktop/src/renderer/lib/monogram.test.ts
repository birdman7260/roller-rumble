import { describe, expect, it } from "vitest";
import { getMonogram } from "./monogram";

describe("getMonogram", () => {
  it("uses the first and last word initials for multi-word names", () => {
    expect(getMonogram("Michael Bird")).toBe("MB");
  });

  it("collapses three or more words to first and last initials", () => {
    expect(getMonogram("Mary Jane Watson")).toBe("MW");
  });

  it("uses a single initial for one-word names", () => {
    expect(getMonogram("Riley")).toBe("R");
  });

  it("uppercases the initials", () => {
    expect(getMonogram("riley quick")).toBe("RQ");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(getMonogram("  Michael   Bird  ")).toBe("MB");
  });

  it("falls back to a placeholder for an empty name", () => {
    expect(getMonogram("   ")).toBe("?");
  });

  it("handles multi-code-unit first characters without splitting them", () => {
    expect(getMonogram("🚴 Racer")).toBe("🚴R");
  });
});
