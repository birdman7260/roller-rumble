import { describe, expect, it } from "vitest";
import { accountlessRacerSessionSchema } from "./validation";

describe("accountless racer session validation", () => {
  it("requires a display name", () => {
    expect(
      accountlessRacerSessionSchema.safeParse({
        accountlessId: "local-racer-device-id"
      }).success
    ).toBe(false);
  });

  it("accepts accountless sessions with an explicit display name", () => {
    expect(
      accountlessRacerSessionSchema.safeParse({
        displayName: "Birdy",
        accountlessId: "local-racer-device-id"
      }).success
    ).toBe(true);
  });
});
