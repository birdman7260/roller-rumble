import { describe, expect, it } from "vitest";
import { parseLightLookRequest } from "./agent";

describe("photo booth agent light selection API parsing", () => {
  it("resolves a valid look id from the API request body", () => {
    expect(parseLightLookRequest({ lookId: "sparkle" })).toMatchObject({
      lookId: "sparkle",
      label: "Dancing sparkle"
    });
  });

  it("rejects an unknown look id from the API request body", () => {
    expect(() => parseLightLookRequest({ lookId: "not-real" })).toThrow(/Unknown LED look/);
  });
});
