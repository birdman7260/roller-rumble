import type {
  EventPaymentStatus,
  EventRecord,
  RacerRegistrationInput
} from "@roller-rumble/shared/types";
import { racerRegistrationSchema } from "@roller-rumble/shared/validation";

export type RegistrationStepId = "contact-details" | "display-name" | "photo" | "payment";

export interface RegistrationStep {
  id: RegistrationStepId;
  label: string;
}

const contactDetailsStep: RegistrationStep = { id: "contact-details", label: "Your details" };
const displayNameStep: RegistrationStep = { id: "display-name", label: "Racer name" };
const photoStep: RegistrationStep = { id: "photo", label: "Photo" };
const paymentStep: RegistrationStep = { id: "payment", label: "Payment" };

/** The `registration wizard` steps for this event: payment only appears when it charges a fee. */
export function buildRegistrationSteps(
  event: Pick<EventRecord, "paymentRequiredForQueue">
): RegistrationStep[] {
  return event.paymentRequiredForQueue
    ? [contactDetailsStep, displayNameStep, photoStep, paymentStep]
    : [contactDetailsStep, displayNameStep, photoStep];
}

export type ContactDetails = Pick<RacerRegistrationInput, "realName" | "email" | "phone">;
export type ContactDetailsErrors = Partial<Record<keyof ContactDetails, string>>;

const contactDetailsMessages: Record<keyof ContactDetails, string> = {
  realName: "Enter your name (up to 80 characters).",
  email: "Enter an email like you@example.com.",
  phone: "Enter a phone number with 7 to 15 digits."
};

/**
 * Step 1's inline errors, keyed by field. Uses the server's own registration rules (format only,
 * ADR-0024), so a step the wizard lets through is never rejected at submit.
 */
export function validateContactDetails(details: ContactDetails): ContactDetailsErrors {
  const errors: ContactDetailsErrors = {};
  for (const field of ["realName", "email", "phone"] as const) {
    if (!racerRegistrationSchema.shape[field].safeParse(details[field]).success) {
      errors[field] = contactDetailsMessages[field];
    }
  }
  return errors;
}

export interface RegistrationProgress {
  /** The phone holds a device login: the racer exists, so details and racer name are done. */
  registered: boolean;
  /** The per-device draft says step 1 was confirmed before the racer was created. */
  contactDetailsConfirmed: boolean;
  /** Steps after registration this racer has finished, tracked per racer id on the phone. */
  completedStepIds: readonly RegistrationStepId[];
}

function isStepComplete(stepId: RegistrationStepId, progress: RegistrationProgress): boolean {
  if (stepId === "contact-details") {
    return progress.registered || progress.contactDetailsConfirmed;
  }
  if (stepId === "display-name") {
    return progress.registered;
  }
  return progress.completedStepIds.includes(stepId);
}

/** The first step still to do, or `null` once the wizard is finished. */
export function resolveResumeStep(
  steps: readonly RegistrationStep[],
  progress: RegistrationProgress
): RegistrationStepId | null {
  return steps.find((step) => !isStepComplete(step.id, progress))?.id ?? null;
}

export interface RegisteredRacerState {
  /** The racer has an avatar on the server, whether uploaded here or sent by the photo booth. */
  hasPhoto: boolean;
  paymentStatus: EventPaymentStatus;
  /** Stripe Checkout is set up, so the payment step pays online instead of at the desk. */
  onlinePaymentAvailable: boolean;
  /** This phone's racer has read the "pay at the desk" step and moved on. */
  payAtDeskAcknowledged: boolean;
}

/**
 * The steps after registration this racer has finished. The photo and an online payment are
 * read from server state, so a booth photo or a Stripe confirmation completes its step on any
 * reload; only "pay at the desk" is the racer's own acknowledgement.
 */
export function completedRegistrationSteps(racer: RegisteredRacerState): RegistrationStepId[] {
  const completed: RegistrationStepId[] = [];
  if (racer.hasPhoto) {
    completed.push("photo");
  }
  const settled = racer.paymentStatus === "paid" || racer.paymentStatus === "waived";
  if (settled || (!racer.onlinePaymentAvailable && racer.payAtDeskAcknowledged)) {
    completed.push("payment");
  }
  return completed;
}
