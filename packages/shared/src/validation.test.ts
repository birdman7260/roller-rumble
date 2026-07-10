import { describe, expect, it } from "vitest";
import {
  accountlessRacerSessionSchema,
  adminNotificationSchema,
  projectorWindowResizeSchema,
  settingUpdateSchema,
  updateEventSchema
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

describe("update event validation", () => {
  it("accepts a partial update with no fields", () => {
    const result = updateEventSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({});
  });

  it("trims the name and passes copy fields through", () => {
    const result = updateEventSchema.safeParse({
      name: "  Friday Finals  ",
      description: "  Bring your A game.  ",
      signupEyebrow: "Queue open",
      signupHeading: "Scan to race"
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      name: "Friday Finals",
      description: "Bring your A game.",
      signupEyebrow: "Queue open",
      signupHeading: "Scan to race"
    });
  });

  it("normalizes blank and whitespace-only copy fields to null", () => {
    const result = updateEventSchema.safeParse({
      description: "",
      signupEyebrow: "   ",
      signupHeading: "\n\t"
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      description: null,
      signupEyebrow: null,
      signupHeading: null
    });
  });

  it("passes an explicit null copy field through", () => {
    const result = updateEventSchema.safeParse({ description: null });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ description: null });
  });

  it("rejects a blank or whitespace-only name", () => {
    expect(updateEventSchema.safeParse({ name: "" }).success).toBe(false);
    expect(updateEventSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("enforces length caps", () => {
    expect(updateEventSchema.safeParse({ name: "n".repeat(121) }).success).toBe(false);
    expect(updateEventSchema.safeParse({ description: "d".repeat(501) }).success).toBe(false);
    expect(updateEventSchema.safeParse({ signupEyebrow: "e".repeat(81) }).success).toBe(false);
    expect(updateEventSchema.safeParse({ signupHeading: "h".repeat(81) }).success).toBe(false);
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
