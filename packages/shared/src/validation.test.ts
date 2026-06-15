import { describe, expect, it } from "vitest";
import {
  accountlessRacerSessionSchema,
  adminNotificationSchema,
  projectorWindowResizeSchema,
  settingUpdateSchema
} from "./validation";

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

describe("admin settings validation", () => {
  it("accepts the public racer info setting", () => {
    expect(
      settingUpdateSchema.safeParse({
        showPublicRacerInfoWithoutLogin: true
      }).success
    ).toBe(true);
  });
});

describe("projector window resize validation", () => {
  it("accepts supported projector test sizes", () => {
    expect(projectorWindowResizeSchema.safeParse({ preset: "720p" }).success).toBe(true);
    expect(projectorWindowResizeSchema.safeParse({ preset: "1080p" }).success).toBe(true);
  });

  it("rejects unsupported projector sizes", () => {
    expect(projectorWindowResizeSchema.safeParse({ preset: "4k" }).success).toBe(false);
  });
});
