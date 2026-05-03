import { describe, expect, it } from "vitest";
import { themes, validateThemes } from "./themes";

describe("theme registry", () => {
  it("validates built-in themes", () => {
    expect(validateThemes(themes)).toEqual([]);
  });
});
