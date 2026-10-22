import { DEFAULT_QUEUE_CLOSED_MESSAGE } from "@roller-rumble/shared/constants";
import { Button } from "@roller-rumble/shared-ui";
import type { ReactNode } from "react";
import { fireAndForget } from "../../lib/ui-actions";
import type { QueueDockState } from "./queue-dock-state";
import type { RacerQueueSignupInput } from "./shared";

function DockIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="racer-queue-dock__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function DockAction({
  busy = false,
  disabled,
  icon,
  label,
  onClick,
  variant = "ghost"
}: {
  busy?: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "ghost" | "accent";
}) {
  return (
    <Button
      className="racer-queue-dock__action"
      variant={variant}
      busy={busy}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}

/**
 * The racer's queue actions, docked to the top of the bottom tabs so they are one tap away from
 * every tab: join the head-to-head queue, queue a solo run, or open the challenge picker.
 */
export function QueueDock({
  allowSolo,
  closedMessage,
  onOpenChallenge,
  onQueueSignup,
  pending,
  state
}: {
  state: QueueDockState;
  allowSolo: boolean;
  /** The operator's closed-queue message; blank falls back to the built-in default. */
  closedMessage: string;
  onQueueSignup: (input: RacerQueueSignupInput) => Promise<void>;
  onOpenChallenge: () => void;
  /** The queue signup still waiting on the server, which holds every action until it answers. */
  pending: RacerQueueSignupInput | null;
}) {
  if (state === "hidden") {
    return null;
  }

  if (state === "closed") {
    return (
      <div className="racer-queue-dock">
        <p className="racer-queue-dock__closed">
          {closedMessage.trim() || DEFAULT_QUEUE_CLOSED_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <fieldset className="racer-queue-dock">
      <legend className="visually-hidden">Queue actions</legend>
      <DockAction
        variant="accent"
        busy={pending?.requestedType === "auto-match"}
        disabled={pending !== null}
        label="Queue up"
        icon={
          <DockIcon>
            <path d="M3 6h12M3 12h12M3 18h8M18 15v6M15 18h6" />
          </DockIcon>
        }
        onClick={() => {
          fireAndForget(onQueueSignup({ requestedType: "auto-match" }), "join queue");
        }}
      />
      {allowSolo ? (
        <DockAction
          busy={pending?.requestedType === "solo"}
          disabled={pending !== null}
          label="Solo"
          icon={
            <DockIcon>
              <circle cx="12" cy="14" r="7" />
              <path d="M12 10.5V14l2.2 2.2M10 3h4M12 3v4" />
            </DockIcon>
          }
          onClick={() => {
            fireAndForget(onQueueSignup({ requestedType: "solo" }), "join solo queue");
          }}
        />
      ) : null}
      <DockAction
        disabled={pending !== null}
        label="Challenge"
        icon={
          <span className="racer-queue-dock__vs" aria-hidden="true">
            VS
          </span>
        }
        onClick={onOpenChallenge}
      />
    </fieldset>
  );
}
