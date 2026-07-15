import { DEFAULT_QUEUE_CLOSED_MESSAGE } from "@roller-rumble/shared/constants";
import type { AppSnapshot, RacerSummary } from "@roller-rumble/shared/types";
import { Button, EmptyState, SearchableSelect } from "@roller-rumble/shared-ui";
import { fireAndForget } from "../../lib/ui-actions";
import type { RacerQueueSignupInput } from "./shared";

export function QueueActions({
  liveSnapshot,
  onQueueSignup,
  paymentReturnState,
  queueMessage,
  selectedOpponent,
  selectedRacer,
  selectedRacerId,
  setSelectedOpponent
}: {
  liveSnapshot: AppSnapshot;
  onQueueSignup: (input: RacerQueueSignupInput) => Promise<void>;
  paymentReturnState: string | null;
  queueMessage: string | null;
  selectedOpponent: string;
  selectedRacer?: RacerSummary | null;
  selectedRacerId: string;
  setSelectedOpponent: (value: string) => void;
}) {
  if (!liveSnapshot.settings.queueOpen) {
    return (
      <EmptyState
        title="Queue closed"
        body={liveSnapshot.settings.queueClosedMessage.trim() || DEFAULT_QUEUE_CLOSED_MESSAGE}
      />
    );
  }

  return (
    <div className="stack-sm">
      <div className="racer-section-heading">
        <strong>Join the next race</strong>
        <p>
          {liveSnapshot.activeEvent.paymentRequiredForQueue
            ? "Checkout will open if you have not paid yet."
            : "Jump into the next open time trial race with one tap."}
        </p>
      </div>
      {paymentReturnState === "success" ? (
        <p className="form-success">
          {selectedRacer?.payment.status === "paid"
            ? "Payment confirmed. You are ready to race."
            : "Payment is processing. This card will update as soon as Stripe confirms it."}
        </p>
      ) : null}
      {paymentReturnState === "cancelled" ? (
        <p className="form-error">Checkout was cancelled. You can try again.</p>
      ) : null}
      {queueMessage ? <p className="form-error">{queueMessage}</p> : null}
      <div className="racer-action-grid">
        <Button
          onClick={() => {
            fireAndForget(onQueueSignup({ requestedType: "auto-match" }), "join queue");
          }}
        >
          Join Queue
        </Button>
        {liveSnapshot.settings.allowSoloQueue ? (
          <Button
            variant="ghost"
            onClick={() => {
              fireAndForget(onQueueSignup({ requestedType: "solo" }), "join solo queue");
            }}
          >
            Solo Run
          </Button>
        ) : null}
      </div>
      <div className="racer-challenge-controls">
        <label className="racer-picker-label" htmlFor="racer-challenge-opponent">
          Challenge
          <SearchableSelect
            id="racer-challenge-opponent"
            value={selectedOpponent}
            placeholder="Type to find an opponent"
            options={liveSnapshot.racers.flatMap((entry) =>
              entry.racer.id === selectedRacerId
                ? []
                : [{ value: entry.racer.id, label: entry.racer.displayName }]
            )}
            onValueChange={setSelectedOpponent}
            noResultsText="No racers match that search"
          />
        </label>
        <Button
          variant="accent"
          disabled={!selectedOpponent}
          onClick={() => {
            fireAndForget(onQueueSignup({ opponentRacerId: selectedOpponent }), "challenge racer");
          }}
        >
          Challenge
        </Button>
      </div>
    </div>
  );
}
