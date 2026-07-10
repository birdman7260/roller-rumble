import type { RacerNotification } from "@roller-rumble/shared/types";
import { Button } from "@roller-rumble/shared-ui";
import { AnimatePresence, m } from "framer-motion";
import { fireAndForget } from "../../lib/ui-actions";

function getNotificationModalLabel(notification: RacerNotification): string {
  switch (notification.type) {
    case "queue_get_ready":
      return "Race Coming Up";
    case "tournament_started":
      return "Tournament Check-In";
    case "admin_message":
      return "Host Message";
    default:
      return "Race Update";
  }
}

export function RacerNotificationModal({
  modalActionMessage,
  notification,
  onAcceptTournamentSpot,
  onDismiss,
  onTournamentOptOut,
  tournamentOptOutBusy
}: {
  modalActionMessage: string | null;
  notification: RacerNotification | null;
  onAcceptTournamentSpot?: () => void;
  onDismiss: (notification: RacerNotification) => Promise<void>;
  onTournamentOptOut: () => Promise<void>;
  tournamentOptOutBusy: boolean;
}) {
  return (
    <AnimatePresence>
      {notification ? (
        <m.div
          className={`racer-notification-modal racer-notification-modal--${notification.type}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="racer-notification-modal-title"
        >
          <m.div
            className="racer-notification-modal__card"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
          >
            <button
              type="button"
              className="racer-notification-modal__close"
              onClick={() => {
                fireAndForget(onDismiss(notification), "close racer notification");
              }}
            >
              Close
            </button>
            <span className="racer-notification-modal__eyebrow">
              {getNotificationModalLabel(notification)}
            </span>
            <h2 id="racer-notification-modal-title">{notification.title}</h2>
            <p>{notification.body}</p>
            {modalActionMessage ? (
              <p className="racer-notification-modal__action-message">{modalActionMessage}</p>
            ) : null}
            <div className="racer-notification-modal__actions">
              {notification.type === "tournament_started" ? (
                <>
                  <Button
                    variant="ghost"
                    disabled={tournamentOptOutBusy}
                    onClick={() => {
                      fireAndForget(onTournamentOptOut(), "opt out of tournament");
                    }}
                  >
                    {tournamentOptOutBusy ? "Removing..." : "Remove Me"}
                  </Button>
                  <Button
                    variant="accent"
                    onClick={() => {
                      fireAndForget(onDismiss(notification), "accept tournament notification");
                      onAcceptTournamentSpot?.();
                    }}
                  >
                    Accept Spot
                  </Button>
                </>
              ) : (
                <Button
                  variant="accent"
                  onClick={() => {
                    fireAndForget(onDismiss(notification), "dismiss racer notification");
                  }}
                >
                  {notification.type === "queue_get_ready" ? "I'm On My Way" : "Dismiss"}
                </Button>
              )}
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
