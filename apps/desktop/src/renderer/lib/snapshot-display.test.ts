import { describe, expect, it } from "vitest";
import { truncateRacerName } from "./snapshot-display";

describe("truncateRacerName", () => {
  it("leaves a name of twenty characters or fewer alone", () => {
    expect(truncateRacerName("Tygarreiz boiiiiiiii")).toBe("Tygarreiz boiiiiiiii");
  });

  it("cuts a longer name to twenty characters and an ellipsis", () => {
    expect(truncateRacerName("Tygarreiz boiiiiiiiiiiiii")).toBe("Tygarreiz boiiiiiiii…");
  });

  it("drops a trailing space at the cut", () => {
    expect(truncateRacerName("Chain Lightning Bolt Express")).toBe("Chain Lightning Bolt…");
    expect(truncateRacerName("Nineteen characters Long")).toBe("Nineteen characters…");
  });

  it("counts an emoji as one character", () => {
    expect(truncateRacerName("🚲".repeat(21))).toBe(`${"🚲".repeat(20)}…`);
  });
});
