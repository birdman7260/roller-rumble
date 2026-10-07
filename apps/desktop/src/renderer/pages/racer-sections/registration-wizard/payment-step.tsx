import { useState } from "react";
import type { EventRecord } from "@roller-rumble/shared/types";
import { Button } from "@roller-rumble/shared-ui";
import { startRacerEntryCheckout } from "../../../lib/api";
import { fireAndForget } from "../../../lib/ui-actions";
import { formatPaymentAmount } from "../shared";

type PaymentEvent = Pick<EventRecord, "paymentAmountCents" | "paymentCurrency">;

function entryFeeLabel(event: PaymentEvent): string | null {
  return typeof event.paymentAmountCents === "number"
    ? formatPaymentAmount(event.paymentAmountCents, event.paymentCurrency)
    : null;
}

/**
 * Step 4, "Payment", for events with an entry fee. With Stripe set up it opens Checkout and
 * completes when the server says the fee is paid; without it, it tells the racer to pay the host.
 */
export function PaymentStep({
  event,
  onlinePaymentAvailable,
  paymentReturnState,
  onAcknowledgePayAtDesk
}: {
  event: PaymentEvent;
  onlinePaymentAvailable: boolean;
  paymentReturnState: string | null;
  onAcknowledgePayAtDesk: () => void;
}) {
  const fee = entryFeeLabel(event);
  if (!onlinePaymentAvailable) {
    return (
      <div className="form-grid">
        <div className="racer-section-heading">
          <strong>Pay at the desk</strong>
          <p>
            {fee ? `The entry fee is ${fee}. ` : ""}Pay the host at the desk before your first race
            and they'll mark you paid.
          </p>
        </div>
        <div className="button-row">
          <Button variant="accent" onClick={onAcknowledgePayAtDesk}>
            Got it
          </Button>
        </div>
      </div>
    );
  }

  return <OnlinePaymentStep fee={fee} paymentReturnState={paymentReturnState} />;
}

function OnlinePaymentStep({
  fee,
  paymentReturnState
}: {
  fee: string | null;
  paymentReturnState: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function openCheckout(): Promise<void> {
    setBusy(true);
    setErrorMessage(null);
    try {
      const checkout = await startRacerEntryCheckout();
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not open checkout.");
      setBusy(false);
    }
  }

  if (paymentReturnState === "success") {
    return (
      <div className="form-grid">
        <div className="racer-section-heading">
          <strong>Entry fee</strong>
          <p className="form-success">
            Thanks! Confirming your payment with Stripe. This moves on by itself in a moment.
          </p>
          <p>Still here after a minute? The host can mark you paid at the desk.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-grid">
      <div className="racer-section-heading">
        <strong>Entry fee</strong>
        <p>
          {fee ? `Racing here costs ${fee}. ` : ""}You'll pay securely with Stripe and come straight
          back here.
        </p>
      </div>
      {paymentReturnState === "cancelled" ? (
        <p className="form-error">Checkout was cancelled. You can try again.</p>
      ) : null}
      {errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="button-row">
        <Button
          variant="accent"
          disabled={busy}
          onClick={() => {
            fireAndForget(openCheckout(), "open entry fee checkout");
          }}
        >
          {busy ? "Opening checkout..." : fee ? `Pay ${fee}` : "Pay entry fee"}
        </Button>
      </div>
    </div>
  );
}
