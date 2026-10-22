import type { AppSnapshot, ChallengeAnswer } from "@roller-rumble/shared/types";
import { Button } from "@roller-rumble/shared-ui";
import { AnimatePresence, m } from "framer-motion";
import { useState } from "react";
import { resolveRacerName } from "../../lib/snapshot-display";
import { fireAndForget } from "../../lib/ui-actions";

/**
 * Asks the signed-in racer to answer the first `challenge request` waiting on them. The request
 * comes straight from the queue in the snapshot, so it opens wherever the racer is on the page and
 * closes on its own once the request is answered or withdrawn.
 */
export function IncomingChallengeModal({
  liveSnapshot,
  onAnswer,
  selectedRacerId
}: {
  liveSnapshot: AppSnapshot;
  onAnswer: (entryId: string, answer: ChallengeAnswer) => Promise<void>;
  /** Empty while no racer is signed in, so nothing is ever asked. */
  selectedRacerId: string;
}) {
  const [busyAnswer, setBusyAnswer] = useState<ChallengeAnswer | null>(null);
  const request = selectedRacerId
    ? liveSnapshot.queue.find(
        (entry) => entry.status === "queued" && entry.awaitingRacerId === selectedRacerId
      )
    : undefined;
  const challengerId = request?.racerIds.find((racerId) => racerId !== selectedRacerId);
  const challengerName = resolveRacerName(liveSnapshot, challengerId, "A racer");

  async function answer(entryId: string, choice: ChallengeAnswer): Promise<void> {
    setBusyAnswer(choice);
    try {
      await onAnswer(entryId, choice);
    } finally {
      setBusyAnswer(null);
    }
  }

  return (
    <AnimatePresence>
      {request ? (
        <m.div
          key={request.id}
          className="racer-notification-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="racer-incoming-challenge-modal-title"
        >
          <m.div
            className="racer-notification-modal__card"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
          >
            <span className="racer-notification-modal__eyebrow">Challenge</span>
            <h2 id="racer-incoming-challenge-modal-title">{challengerName} challenged you!</h2>
            <p>
              Accept to race {challengerName}. Your race is #{request.position} in the queue and
              waits there until you answer.
            </p>
            <div className="racer-notification-modal__actions">
              <Button
                variant="ghost"
                disabled={busyAnswer !== null}
                busy={busyAnswer === "decline"}
                onClick={() => {
                  fireAndForget(answer(request.id, "decline"), "decline challenge");
                }}
              >
                Decline
              </Button>
              <Button
                variant="accent"
                disabled={busyAnswer !== null}
                busy={busyAnswer === "accept"}
                onClick={() => {
                  fireAndForget(answer(request.id, "accept"), "accept challenge");
                }}
              >
                Accept
              </Button>
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
