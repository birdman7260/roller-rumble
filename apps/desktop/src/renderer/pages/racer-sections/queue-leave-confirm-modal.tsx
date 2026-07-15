import { Button } from "@roller-rumble/shared-ui";
import { AnimatePresence, m } from "framer-motion";
import { fireAndForget } from "../../lib/ui-actions";

export interface QueueLeaveRequest {
  mode: "all" | "entry";
  entryId?: string;
  // Set when the spot being left is a challenge, so the copy can name the
  // matchup the racer is cancelling.
  opponentName?: string | null;
}

function getModalCopy(request: QueueLeaveRequest): {
  eyebrow: string;
  title: string;
  body: string;
} {
  if (request.mode === "all") {
    return {
      eyebrow: "Leave Queue",
      title: "Leave the queue entirely?",
      body: "This drops every upcoming race you're in. You can jump back in whenever the queue is open."
    };
  }

  if (request.opponentName) {
    return {
      eyebrow: "Leave Race",
      title: "Leave this challenge?",
      body: `This cancels your challenge against ${request.opponentName}.`
    };
  }

  return {
    eyebrow: "Leave Race",
    title: "Leave this race?",
    body: "This drops you from this upcoming race. You can join again whenever the queue is open."
  };
}

export function QueueLeaveConfirmModal({
  request,
  busy,
  onConfirm,
  onCancel
}: {
  request: QueueLeaveRequest | null;
  busy: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const copy = request ? getModalCopy(request) : null;

  return (
    <AnimatePresence>
      {request && copy ? (
        <m.div
          className="racer-notification-modal racer-notification-modal--opt-out-confirm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="racer-leave-confirm-modal-title"
        >
          <m.div
            className="racer-notification-modal__card"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
          >
            <span className="racer-notification-modal__eyebrow">{copy.eyebrow}</span>
            <h2 id="racer-leave-confirm-modal-title">{copy.title}</h2>
            <p>{copy.body}</p>
            <div className="racer-notification-modal__actions">
              <Button variant="ghost" disabled={busy} onClick={onCancel}>
                Stay
              </Button>
              <Button
                variant="accent"
                disabled={busy}
                onClick={() => {
                  fireAndForget(onConfirm(), "confirm leave queue");
                }}
              >
                {busy ? "Leaving..." : "Leave"}
              </Button>
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
