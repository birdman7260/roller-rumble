import { useState } from "react";
import type { ChangeEvent } from "react";
import type {
  EventRecord,
  RacerAuthSuccessResponse,
  RacerSummary
} from "@roller-rumble/shared/types";
import { Button, Panel, StepProgress } from "@roller-rumble/shared-ui";
import { registerRacer, updateRacerDetails } from "../../../lib/api";
import { fireAndForget } from "../../../lib/ui-actions";
import { ContactDetailsStep } from "./contact-details-step";
import { DisplayNameStep } from "./display-name-step";
import { PaymentStep } from "./payment-step";
import { PhotoStep } from "./photo-step";
import { loadRegistrationDraft, saveRegistrationDraft } from "./registration-draft";
import type { RegistrationDraft } from "./registration-draft";
import { buildRegistrationSteps, resolveResumeStep } from "./registration-steps";
import type { RegisteredRacerSteps } from "./use-registered-racer-steps";

/**
 * What the wizard needs once this phone holds a device login: the photo and payment steps, and
 * Back to the racer name and details steps to correct them.
 */
export interface SignedInRegistration {
  racer: RacerSummary;
  steps: RegisteredRacerSteps;
  /** The racer saved corrected details and racer name from a revisited step. */
  onDetailsUpdated: (result: RacerAuthSuccessResponse) => void;
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
 * runs the photo and payment steps, and Back from the photo step revisits the racer name and
 * details, saving any corrections to the racer. Either way it resumes at the first unfinished
 * step.
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

  // The draft outlives registration so Back can show what the racer typed; signing out clears it.
  async function submitDetails(): Promise<void> {
    setBusy(true);
    setErrorMessage(null);
    const details = {
      realName: draft.realName,
      email: draft.email,
      phone: draft.phone,
      displayName: draft.displayName
    };
    try {
      if (signedIn) {
        signedIn.onDetailsUpdated(await updateRacerDetails(details));
        signedIn.steps.finishRevisit();
      } else {
        onRegistered(await registerRacer(details));
      }
    } catch (error) {
      const fallback = signedIn ? "Could not save your changes." : "Could not sign you up.";
      setErrorMessage(error instanceof Error ? error.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="registration-wizard stack-md">
      {currentStepId ? <StepProgress steps={steps} currentStepId={currentStepId} /> : null}
      <Panel title="Register">
        {currentStepId === "contact-details" ? (
          <ContactDetailsStep
            details={draft}
            onChange={updateDraft}
            onContinue={() => {
              if (signedIn) {
                signedIn.steps.revisitStep("display-name");
              } else {
                updateDraft({ contactDetailsConfirmed: true });
              }
            }}
          />
        ) : null}
        {currentStepId === "display-name" ? (
          <DisplayNameStep
            displayName={draft.displayName}
            busy={busy}
            busyLabel={signedIn ? "Saving..." : "Signing you up..."}
            errorMessage={errorMessage}
            onChange={(displayName) => {
              updateDraft({ displayName });
            }}
            onBack={() => {
              setErrorMessage(null);
              if (signedIn) {
                signedIn.steps.revisitStep("contact-details");
              } else {
                updateDraft({ contactDetailsConfirmed: false });
              }
            }}
            onSubmit={() => {
              fireAndForget(submitDetails(), signedIn ? "save racer details" : "register racer");
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
            onBack={() => {
              // The racer record holds the name the projector shows, so Back starts from it.
              setErrorMessage(null);
              updateDraft({ displayName: signedIn.racer.racer.displayName });
              signedIn.steps.revisitStep("display-name");
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
            onBack={() => {
              signedIn.steps.revisitStep("photo");
            }}
          />
        ) : null}
      </Panel>
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
