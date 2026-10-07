import { describe, expect, it } from "vitest";
import {
  buildRegistrationSteps,
  completedRegistrationSteps,
  resolveResumeStep,
  validateContactDetails
} from "./registration-steps";

describe("buildRegistrationSteps", () => {
  it("runs details, racer name, then photo when the event is free", () => {
    expect(
      buildRegistrationSteps({ paymentRequiredForQueue: false }).map((step) => step.id)
    ).toEqual(["contact-details", "display-name", "photo"]);
  });

  it("ends with payment when the event charges an entry fee", () => {
    expect(
      buildRegistrationSteps({ paymentRequiredForQueue: true }).map((step) => step.id)
    ).toEqual(["contact-details", "display-name", "photo", "payment"]);
  });
});

describe("validateContactDetails", () => {
  const valid = { realName: "Ada Lovelace", email: "ada@example.com", phone: "(555) 010-0100" };

  it("accepts a real name, email, and phone", () => {
    expect(validateContactDetails(valid)).toEqual({});
  });

  it("flags every missing field", () => {
    expect(Object.keys(validateContactDetails({ realName: " ", email: "", phone: "" }))).toEqual([
      "realName",
      "email",
      "phone"
    ]);
  });

  it("explains a malformed email", () => {
    expect(validateContactDetails({ ...valid, email: "ada@" })).toEqual({
      email: "Enter an email like you@example.com."
    });
  });

  it("explains a phone number with too few digits", () => {
    expect(validateContactDetails({ ...valid, phone: "555-01" })).toEqual({
      phone: "Enter a phone number with 7 to 15 digits."
    });
  });

  it("rejects a real name longer than 80 characters", () => {
    expect(validateContactDetails({ ...valid, realName: "x".repeat(81) })).toHaveProperty(
      "realName"
    );
  });
});

describe("resolveResumeStep", () => {
  const freeEventSteps = buildRegistrationSteps({ paymentRequiredForQueue: false });
  const paidEventSteps = buildRegistrationSteps({ paymentRequiredForQueue: true });
  const newcomer = { registered: false, contactDetailsConfirmed: false, completedStepIds: [] };

  it("starts a newcomer on their details", () => {
    expect(resolveResumeStep(freeEventSteps, newcomer)).toBe("contact-details");
  });

  it("returns a newcomer who already confirmed their details to the racer name", () => {
    expect(resolveResumeStep(freeEventSteps, { ...newcomer, contactDetailsConfirmed: true })).toBe(
      "display-name"
    );
  });

  it("never sends an already registered racer back to their details or racer name", () => {
    expect(resolveResumeStep(paidEventSteps, { ...newcomer, registered: true })).toBe("photo");
  });

  it("resumes a registered racer at the first step they have not finished", () => {
    expect(
      resolveResumeStep(paidEventSteps, {
        ...newcomer,
        registered: true,
        completedStepIds: ["photo"]
      })
    ).toBe("payment");
  });

  it("is done once every step is finished", () => {
    expect(
      resolveResumeStep(freeEventSteps, {
        ...newcomer,
        registered: true,
        completedStepIds: ["photo"]
      })
    ).toBeNull();
  });
});

describe("completedRegistrationSteps", () => {
  const freshRacer = {
    hasPhoto: false,
    paymentStatus: "unpaid" as const,
    onlinePaymentAvailable: true,
    payAtDeskAcknowledged: false
  };

  it("leaves the photo step open until the racer has a photo on the server", () => {
    expect(completedRegistrationSteps(freshRacer)).not.toContain("photo");
    expect(completedRegistrationSteps({ ...freshRacer, hasPhoto: true })).toContain("photo");
  });

  it("completes online payment only once the racer's entry fee is paid or waived", () => {
    expect(completedRegistrationSteps(freshRacer)).not.toContain("payment");
    expect(
      completedRegistrationSteps({ ...freshRacer, payAtDeskAcknowledged: true })
    ).not.toContain("payment");
    expect(completedRegistrationSteps({ ...freshRacer, paymentStatus: "paid" })).toContain(
      "payment"
    );
    expect(completedRegistrationSteps({ ...freshRacer, paymentStatus: "waived" })).toContain(
      "payment"
    );
  });

  it("lets the racer move on once they acknowledge paying at the desk", () => {
    const noStripe = { ...freshRacer, onlinePaymentAvailable: false };
    expect(completedRegistrationSteps(noStripe)).not.toContain("payment");
    expect(completedRegistrationSteps({ ...noStripe, payAtDeskAcknowledged: true })).toContain(
      "payment"
    );
  });
});
