import { describe, expect, it } from "vitest";
import { countRowsThatFit } from "./use-rows-that-fit";

describe("countRowsThatFit", () => {
  it("shows every row when they all fit", () => {
    expect(countRowsThatFit({ rowBottoms: [40, 80, 120], height: 120, footnoteSpace: 30 })).toBe(3);
  });

  it("drops the rows that would run past the bottom, leaving room for the footnote", () => {
    // 150 is past the bottom; the footnote then needs 30, so the row ending at 120 goes too.
    expect(
      countRowsThatFit({ rowBottoms: [40, 80, 120, 150], height: 140, footnoteSpace: 30 })
    ).toBe(2);
  });

  it("counts a tall wrapped row by where it ends, not by how many rows came before it", () => {
    expect(
      countRowsThatFit({ rowBottoms: [40, 130, 170, 210], height: 200, footnoteSpace: 0 })
    ).toBe(3);
  });

  it("always keeps the first row, even when it alone overflows", () => {
    expect(countRowsThatFit({ rowBottoms: [260, 300], height: 200, footnoteSpace: 30 })).toBe(1);
  });

  it("has nothing to fit in an empty list", () => {
    expect(countRowsThatFit({ rowBottoms: [], height: 200, footnoteSpace: 30 })).toBe(0);
  });
});
