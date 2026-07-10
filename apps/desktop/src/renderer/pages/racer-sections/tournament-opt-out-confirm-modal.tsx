import { Button } from "@roller-rumble/shared-ui";
import { AnimatePresence, m } from "framer-motion";
import { fireAndForget } from "../../lib/ui-actions";

export function TournamentOptOutConfirmModal({
  open,
  busy,
  onConfirm,
  onCancel
}: {
  open: boolean;
  busy: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <m.div
          className="racer-notification-modal racer-notification-modal--opt-out-confirm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="racer-opt-out-confirm-modal-title"
        >
          <m.div
            className="racer-notification-modal__card"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
          >
            <span className="racer-notification-modal__eyebrow">Leave Tournament</span>
            <h2 id="racer-opt-out-confirm-modal-title">Are you sure?</h2>
            <p>If you opt out of this tournament you can&rsquo;t be added back in.</p>
            <div className="racer-notification-modal__actions">
              <Button variant="ghost" disabled={busy} onClick={onCancel}>
                No
              </Button>
              <Button
                variant="accent"
                disabled={busy}
                onClick={() => {
                  fireAndForget(onConfirm(), "confirm opt out of tournament");
                }}
              >
                {busy ? "Opting out..." : "Yes"}
              </Button>
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
