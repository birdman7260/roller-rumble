import { describe, expect, it } from "vitest";
import { accountlessRacerSessionSchema, adminNotificationSchema } from "./validation";

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

describe("admin notification validation", () => {
  it("accepts explicit notification types for lab sends", () => {
    expect(
      adminNotificationSchema.safeParse({
        body: "Your bracket is live.",
        targetType: "selected",
        title: "Tournament check-in",
        type: "tournament_started",
        racerIds: ["racer-1"]
      }).success
    ).toBe(true);
  });

  it("rejects unknown notification types", () => {
    expect(
      adminNotificationSchema.safeParse({
        body: "Nope.",
        targetType: "event",
        title: "Bad type",
        type: "mystery_message"
      }).success
    ).toBe(false);
  });
});
