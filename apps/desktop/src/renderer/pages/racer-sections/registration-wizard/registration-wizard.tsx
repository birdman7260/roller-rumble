import { useState } from "react";
import type { ChangeEvent } from "react";
import type {
  EventRecord,
  RacerAuthSuccessResponse,
  RacerSummary
} from "@roller-rumble/shared/types";
import { Button, StepProgress } from "@roller-rumble/shared-ui";
import { registerRacer } from "../../../lib/api";
import { fireAndForget } from "../../../lib/ui-actions";
import { ContactDetailsStep } from "./contact-details-step";
import { DisplayNameStep } from "./display-name-step";
import { PaymentStep } from "./payment-step";
import { PhotoStep } from "./photo-step";
import {
  clearRegistrationDraft,
  emptyRegistrationDraft,
  loadRegistrationDraft,
  saveRegistrationDraft
} from "./registration-draft";
import type { RegistrationDraft } from "./registration-draft";
import { buildRegistrationSteps, resolveResumeStep } from "./registration-steps";
import type { RegisteredRacerSteps } from "./use-registered-racer-steps";

/** What the wizard needs once this phone holds a device login: the photo and payment steps. */
export interface SignedInRegistration {
  racer: RacerSummary;
  steps: RegisteredRacerSteps;
  avatarUrl: string | null;
  avatarUploadBusy: boolean;
  avatarUploadMessage: string | null;
  onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  /** Asks to sign out, so a racer stuck on a step can start over as someone new (D12). */
  onSignOut: () => void;
  onlinePaymentAvailable: boolean;
  paymentReturnState: string | null;
  photoBoothEnabled: boolean;
}

/**
 * The `registration wizard`. Before the racer exists it keeps what they type as a per-device
 * draft and creates the racer when the racer name is submitted (ADR-0024); once `signedIn`, it
 * runs the photo and payment steps. Either way it resumes at the first unfinished step.
 */
export function RegistrationWizard({
  event,
  onRegistered,
  signedIn
}: {
  event: Pick<EventRecord, "paymentRequiredForQueue" | "paymentAmountCents" | "paymentCurrency">;
  onRegistered: (result: RacerAuthSuccessResponse) => void;
  signedIn?: SignedInRegistration;
}) {
  const [draft, setDraft] = useState<RegistrationDraft>(loadRegistrationDraft);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const steps = buildRegistrationSteps(event);
  const currentStepId = signedIn
    ? signedIn.steps.currentStepId
    : resolveResumeStep(steps, {
        registered: false,
        contactDetailsConfirmed: draft.contactDetailsConfirmed,
        completedStepIds: []
      });

  function updateDraft(patch: Partial<RegistrationDraft>): void {
    const next = { ...draft, ...patch };
    setDraft(next);
    saveRegistrationDraft(next);
  }

  async function register(): Promise<void> {
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await registerRacer({
        realName: draft.realName,
        email: draft.email,
        phone: draft.phone,
        displayName: draft.displayName
      });
      clearRegistrationDraft();
      setDraft(emptyRegistrationDraft);
      onRegistered(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not sign you up.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="registration-wizard stack-md">
      {currentStepId ? <StepProgress steps={steps} currentStepId={currentStepId} /> : null}
      {currentStepId === "contact-details" ? (
        <ContactDetailsStep
          details={draft}
          onChange={updateDraft}
          onContinue={() => {
            updateDraft({ contactDetailsConfirmed: true });
          }}
        />
      ) : null}
      {currentStepId === "display-name" ? (
        <DisplayNameStep
          displayName={draft.displayName}
          busy={busy}
          errorMessage={errorMessage}
          onChange={(displayName) => {
            updateDraft({ displayName });
          }}
          onBack={() => {
            setErrorMessage(null);
            updateDraft({ contactDetailsConfirmed: false });
          }}
          onSubmit={() => {
            fireAndForget(register(), "register racer");
          }}
        />
      ) : null}
      {signedIn && currentStepId === "photo" ? (
        <PhotoStep
          avatarUrl={signedIn.avatarUrl}
          displayName={signedIn.racer.racer.displayName}
          busy={signedIn.avatarUploadBusy}
          message={signedIn.avatarUploadMessage}
          photoBoothEnabled={signedIn.photoBoothEnabled}
          onUpload={(uploadEvent) => {
            signedIn.steps.holdPhotoStep(signedIn.racer.racer.id);
            fireAndForget(signedIn.onAvatarUpload(uploadEvent), "upload racer photo");
          }}
          onContinue={signedIn.steps.continueFromPhoto}
        />
      ) : null}
      {signedIn && currentStepId === "payment" ? (
        <PaymentStep
          event={event}
          onlinePaymentAvailable={signedIn.onlinePaymentAvailable}
          paymentReturnState={signedIn.paymentReturnState}
          onAcknowledgePayAtDesk={signedIn.steps.acknowledgePayAtDesk}
        />
      ) : null}
      {signedIn ? (
        <div className="button-row">
          <Button variant="ghost" onClick={signedIn.onSignOut}>
            Sign out and start over
          </Button>
        </div>
      ) : null}
    </div>
  );
}
