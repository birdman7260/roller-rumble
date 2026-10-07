import { useState } from "react";
import type { EventRecord, RacerSummary } from "@roller-rumble/shared/types";
import { loadPayAtDeskAcknowledged, savePayAtDeskAcknowledged } from "./pay-at-desk";
import {
  buildRegistrationSteps,
  completedRegistrationSteps,
  resolveResumeStep
} from "./registration-steps";
import type { RegistrationStepId } from "./registration-steps";

export interface RegisteredRacerSteps {
  /** The wizard step this signed-in racer is on, or `null` once registration is finished. */
  currentStepId: RegistrationStepId | null;
  /**
   * Keep the photo step on screen after a photo lands, so the racer sees it and can retake it
   * before moving on. Without the hold, a photo arriving completes the step straight away.
   */
  holdPhotoStep: (racerId: string) => void;
  continueFromPhoto: () => void;
  acknowledgePayAtDesk: () => void;
}

/**
 * Where a signed-in racer is in the `registration wizard`. Steps are complete from server
 * state (an avatar, a paid or waived entry fee), so a reload resumes at the first unfinished
 * step (ADR-0024 D4); only "pay at the desk" is remembered on the phone, per racer id.
 */
export function useRegisteredRacerSteps({
  event,
  racer,
  onlinePaymentAvailable
}: {
  event: Pick<EventRecord, "paymentRequiredForQueue"> | undefined;
  racer: RacerSummary | undefined;
  onlinePaymentAvailable: boolean;
}): RegisteredRacerSteps {
  const [photoHeldForRacerId, setPhotoHeldForRacerId] = useState<string | null>(null);
  const [payAtDeskAcknowledgedRacerId, setPayAtDeskAcknowledgedRacerId] = useState<string | null>(
    null
  );
  const racerId = racer?.racer.id ?? null;

  function resolveCurrentStep(): RegistrationStepId | null {
    if (!event || !racer || !racerId) {
      return null;
    }
    if (photoHeldForRacerId === racerId) {
      return "photo";
    }
    return resolveResumeStep(buildRegistrationSteps(event), {
      registered: true,
      contactDetailsConfirmed: true,
      completedStepIds: completedRegistrationSteps({
        hasPhoto: Boolean(racer.racer.avatarUrl),
        paymentStatus: racer.payment.status,
        onlinePaymentAvailable,
        payAtDeskAcknowledged:
          payAtDeskAcknowledgedRacerId === racerId || loadPayAtDeskAcknowledged(racerId)
      })
    });
  }

  return {
    currentStepId: resolveCurrentStep(),
    holdPhotoStep: setPhotoHeldForRacerId,
    continueFromPhoto: () => {
      setPhotoHeldForRacerId(null);
    },
    acknowledgePayAtDesk: () => {
      if (racerId) {
        savePayAtDeskAcknowledged(racerId);
        setPayAtDeskAcknowledgedRacerId(racerId);
      }
    }
  };
}
