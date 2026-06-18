import { Button } from "@roller-rumble/shared-ui";
import { AnimatePresence, m } from "framer-motion";
import type { QueueIssueModal } from "./shared";

export function QueueIssueModalView({
  issue,
  onDismiss
}: {
  issue: QueueIssueModal | null;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {issue ? (
        <m.div
          className="racer-notification-modal racer-notification-modal--queue-limit"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="racer-queue-limit-modal-title"
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
            <span className="racer-notification-modal__eyebrow">{issue.eyebrow}</span>
            <h2 id="racer-queue-limit-modal-title">{issue.title}</h2>
            <p>{issue.message}</p>
            <div className="racer-notification-modal__actions">
              <Button variant="accent" onClick={onDismiss}>
                Got it
              </Button>
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
