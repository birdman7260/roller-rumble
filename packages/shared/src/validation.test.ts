import { describe, expect, it } from "vitest";
import {
  adminNotificationSchema,
  createRacerSchema,
  projectorWindowResizeSchema,
  racerRegistrationSchema,
  settingUpdateSchema,
  updateEventSchema
} from "./validation";

const validRegistration = {
  realName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "(555) 010-0100",
  displayName: "Countess Crank"
};

describe("racer registration validation", () => {
  it("accepts complete contact details and a display name", () => {
    expect(racerRegistrationSchema.safeParse(validRegistration).success).toBe(true);
  });

  it.each(["realName", "email", "phone", "displayName"] as const)("requires %s", (field) => {
    const { [field]: _omitted, ...rest } = validRegistration;
    expect(racerRegistrationSchema.safeParse(rest).success).toBe(false);
  });

  it("trims the real name and rejects one longer than 80 characters", () => {
    expect(
      racerRegistrationSchema.parse({ ...validRegistration, realName: "  Ada  " }).realName
    ).toBe("Ada");
    expect(
      racerRegistrationSchema.safeParse({ ...validRegistration, realName: "x".repeat(81) }).success
    ).toBe(false);
    expect(
      racerRegistrationSchema.safeParse({ ...validRegistration, realName: "   " }).success
    ).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      racerRegistrationSchema.safeParse({ ...validRegistration, email: "not-an-email" }).success
    ).toBe(false);
  });

  it("stores the phone as entered when it has 7 to 15 digits after punctuation", () => {
    expect(racerRegistrationSchema.parse(validRegistration).phone).toBe("(555) 010-0100");
    expect(
      racerRegistrationSchema.safeParse({ ...validRegistration, phone: "+44 20 7946 0958" }).success
    ).toBe(true);
  });

  it.each(["555-010", "1234567890123456", "555-CALL-NOW", "555 0100 ext"])(
    "rejects the phone %s",
    (phone) => {
      expect(racerRegistrationSchema.safeParse({ ...validRegistration, phone }).success).toBe(
        false
      );
    }
  );
});

describe("admin quick-add racer validation", () => {
  it("accepts only a display name", () => {
    expect(createRacerSchema.safeParse({ displayName: "Speedy" }).success).toBe(true);
  });

  it("requires a display name", () => {
    expect(createRacerSchema.safeParse({ realName: "Ada Lovelace" }).success).toBe(false);
  });

  it("validates optional contact details when given", () => {
    expect(
      createRacerSchema.safeParse({
        displayName: "Speedy",
        realName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "555-010-0100"
      }).success
    ).toBe(true);
    expect(createRacerSchema.safeParse({ displayName: "Speedy", email: "nope" }).success).toBe(
      false
    );
    expect(createRacerSchema.safeParse({ displayName: "Speedy", phone: "12" }).success).toBe(false);
  });

  it("treats blank optional contact details as absent", () => {
    expect(
      createRacerSchema.parse({ displayName: "Speedy", realName: " ", email: "", phone: "" })
    ).toEqual({ displayName: "Speedy" });
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
