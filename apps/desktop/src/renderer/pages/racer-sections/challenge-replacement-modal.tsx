import { Button } from "@roller-rumble/shared-ui";
import { AnimatePresence, m } from "framer-motion";
import type { ChallengeReplacementRequest, RacerQueueSignupInput } from "./shared";

export function ChallengeReplacementModal({
  onDismiss,
  onReplace,
  request
}: {
  onDismiss: () => void;
  onReplace: (input: RacerQueueSignupInput) => void;
  request: ChallengeReplacementRequest | null;
}) {
  return (
    <AnimatePresence>
      {request ? (
        <m.div
          className="racer-notification-modal racer-notification-modal--challenge-replacement"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="racer-challenge-replacement-modal-title"
        >
          <m.div
            className="racer-notification-modal__card"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
          >
            <button type="button" className="racer-notification-modal__close" onClick={onDismiss}>
              Close
            </button>
            <span className="racer-notification-modal__eyebrow">Challenge Queue</span>
            <h2 id="racer-challenge-replacement-modal-title">Pick a challenge to replace</h2>
            <p>{request.message}</p>
            <div className="racer-notification-modal__match-list">
              {request.replaceableMatches.map((match) => (
                <button
                  key={match.queueEntryId}
                  type="button"
                  className="racer-notification-modal__match-option"
                  onClick={() => {
                    onReplace({
                      opponentRacerId: request.opponentRacerId,
                      replaceQueueEntryId: match.queueEntryId
                    });
                  }}
                >
                  <span>Queue #{match.position}</span>
                  <strong>vs {match.opponentDisplayName}</strong>
                </button>
              ))}
            </div>
            <div className="racer-notification-modal__actions">
              <Button variant="ghost" onClick={onDismiss}>
                Cancel
              </Button>
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
