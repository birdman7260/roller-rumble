import { useReducer } from "react";
import type { UnracedRefundCandidate, UnracedRefundOutcome } from "@roller-rumble/shared/types";
import { Button, ConfirmModal, Panel } from "@roller-rumble/shared-ui";
import { previewUnracedRefunds, refundUnracedPayments } from "../../lib/api";
import { formatPaymentAmount } from "../../lib/payment-amount";
import { fireAndForget } from "../../lib/ui-actions";

interface EventRefundsState {
  candidates: UnracedRefundCandidate[] | null;
  outcomes: UnracedRefundOutcome[] | null;
  message: string | null;
  confirmOpen: boolean;
  busy: boolean;
}

function eventRefundsReducer(
  state: EventRefundsState,
  patch: Partial<EventRefundsState>
): EventRefundsState {
  return { ...state, ...patch };
}

const initialEventRefundsState: EventRefundsState = {
  candidates: null,
  outcomes: null,
  message: null,
  confirmOpen: false,
  busy: false
};

function formatTotal(candidates: UnracedRefundCandidate[]): string {
  const totalCents = candidates.reduce((sum, candidate) => sum + candidate.amountCents, 0);
  return formatPaymentAmount(totalCents, candidates[0]?.currency ?? "usd");
}

function pluralizeRacers(count: number): string {
  return `${count} ${count === 1 ? "racer" : "racers"}`;
}

function summarizeOutcomes(outcomes: UnracedRefundOutcome[]): string {
  const count = (status: UnracedRefundOutcome["status"]) =>
    outcomes.filter((outcome) => outcome.status === status).length;
  const pending = count("refund_pending");
  const failed = count("refund_failed");
  return [
    `Refunded ${pluralizeRacers(count("refunded"))}.`,
    pending > 0 ? `${pending} still settling in Stripe.` : null,
    failed > 0 ? `${failed} failed.` : null
  ]
    .filter(Boolean)
    .join(" ");
}

function RefundCandidateList({ candidates }: { candidates: UnracedRefundCandidate[] }) {
  if (candidates.length === 0) {
    return <p>Every racer who paid through Stripe has raced or been refunded.</p>;
  }

  return (
    <ul className="stack-sm">
      {candidates.map((candidate) => (
        <li key={candidate.paymentId}>
          <strong>{candidate.displayName}</strong> ·{" "}
          {formatPaymentAmount(candidate.amountCents, candidate.currency)}
          {candidate.status === "refund_failed" ? (
            <span className="form-error"> · Retry: {candidate.failureMessage}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function FailedRefundList({ outcomes }: { outcomes: UnracedRefundOutcome[] }) {
  const failed = outcomes.filter((outcome) => outcome.status === "refund_failed");
  if (failed.length === 0) {
    return null;
  }

  return (
    <ul className="stack-sm">
      {failed.map((outcome) => (
        <li key={outcome.paymentId} className="form-error">
          {outcome.displayName}: {outcome.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * After the event, refunds the Stripe entrance fee of every racer who paid but never finished a
 * race. Mounted only while Stripe is configured; keyed by the active event id.
 */
export function EventRefundsPanel() {
  const [state, dispatch] = useReducer(eventRefundsReducer, initialEventRefundsState);
  const { candidates, outcomes, message, confirmOpen, busy } = state;
  const reviewedRacers = pluralizeRacers(candidates?.length ?? 0);
  const reviewedTotal = formatTotal(candidates ?? []);

  async function loadCandidates(): Promise<void> {
    dispatch({ busy: true, message: null });
    try {
      const preview = await previewUnracedRefunds();
      dispatch({ candidates: preview.candidates });
    } catch (error) {
      dispatch({
        message: error instanceof Error ? error.message : "Could not load refunds."
      });
    } finally {
      dispatch({ busy: false });
    }
  }

  async function sendRefunds(): Promise<void> {
    dispatch({ busy: true, message: null });
    try {
      const result = await refundUnracedPayments({
        paymentIds: (candidates ?? []).map((candidate) => candidate.paymentId)
      });
      const preview = await previewUnracedRefunds();
      dispatch({
        outcomes: result.outcomes,
        candidates: preview.candidates,
        message: summarizeOutcomes(result.outcomes)
      });
    } catch (error) {
      dispatch({
        message: error instanceof Error ? error.message : "Could not send refunds."
      });
    } finally {
      dispatch({ busy: false, confirmOpen: false });
    }
  }

  return (
    <Panel title="Refunds">
      <div className="form-grid">
        <p>
          Once the event ends, refund the entrance fee to racers who paid through Stripe but never
          finished a race. Stripe keeps its processing fee on each refund.
        </p>
        {candidates ? <RefundCandidateList candidates={candidates} /> : null}
        {message ? <p>{message}</p> : null}
        {outcomes ? <FailedRefundList outcomes={outcomes} /> : null}
        <div className="panel-action-row">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              fireAndForget(loadCandidates(), "load unraced refunds");
            }}
          >
            {candidates ? "Refresh List" : "Review Refunds"}
          </Button>
          {candidates && candidates.length > 0 ? (
            <Button
              disabled={busy}
              onClick={() => {
                dispatch({ confirmOpen: true });
              }}
            >
              {`Refund ${reviewedRacers} (${reviewedTotal})`}
            </Button>
          ) : null}
        </div>
      </div>
      <ConfirmModal
        open={confirmOpen}
        busy={busy}
        title={`Refund ${reviewedRacers}?`}
        body={`Stripe will return ${reviewedTotal} to ${reviewedRacers} who never finished a race. Refunds cannot be undone.`}
        confirmLabel="Send Refunds"
        cancelLabel="Cancel"
        onConfirm={() => {
          fireAndForget(sendRefunds(), "send unraced refunds");
        }}
        onCancel={() => {
          dispatch({ confirmOpen: false });
        }}
      />
    </Panel>
  );
}
