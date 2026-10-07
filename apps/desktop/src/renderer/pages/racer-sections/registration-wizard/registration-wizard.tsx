import { useState } from "react";
import type { EventRecord, RacerAuthSuccessResponse } from "@roller-rumble/shared/types";
import { StepProgress } from "@roller-rumble/shared-ui";
import { registerRacer } from "../../../lib/api";
import { fireAndForget } from "../../../lib/ui-actions";
import { ContactDetailsStep } from "./contact-details-step";
import { DisplayNameStep } from "./display-name-step";
import {
  clearRegistrationDraft,
  emptyRegistrationDraft,
  loadRegistrationDraft,
  saveRegistrationDraft
} from "./registration-draft";
import type { RegistrationDraft } from "./registration-draft";
import { buildRegistrationSteps, resolveResumeStep } from "./registration-steps";

/**
 * The `registration wizard` for a phone with no device login yet. It keeps what the racer types
 * as a per-device draft, resumes at the first unfinished step after a reload, and creates the
 * racer when the racer name is submitted (ADR-0024).
 */
export function RegistrationWizard({
  event,
  onRegistered
}: {
  event: Pick<EventRecord, "paymentRequiredForQueue">;
  onRegistered: (result: RacerAuthSuccessResponse) => void;
}) {
  const [draft, setDraft] = useState<RegistrationDraft>(loadRegistrationDraft);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const steps = buildRegistrationSteps(event);
  const currentStepId = resolveResumeStep(steps, {
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
    </div>
  );
}
