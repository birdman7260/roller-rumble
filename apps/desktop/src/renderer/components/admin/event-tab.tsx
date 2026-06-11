import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import type { AppSnapshot, RaceRecord, TournamentBundle } from "@roller-rumble/shared/types";
import { Button, EmptyState, Panel, StatPill, TextInput } from "@roller-rumble/shared-ui";
import { STRIPE_MIN_PAYMENT_AMOUNT_CENTS } from "@roller-rumble/shared/constants";
import { createEvent, testStripeConnection, updateEventPaymentConfig } from "../../lib/api";
import { formatRacerNames } from "../../lib/snapshot-display";
import { fireAndForget } from "../../lib/ui-actions";

function formatPaymentAmount(amountCents: number | null | undefined, currency: string): string {
  if (typeof amountCents !== "number") {
    return "Not set";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(amountCents / 100);
}

function parseDollarAmountToCents(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed * 100);
}

function formatPaymentInput(amountCents: number | null | undefined): string {
  return typeof amountCents === "number" ? (amountCents / 100).toFixed(2) : "";
}

function EventPaymentsPanel({ snapshot }: { snapshot: AppSnapshot }) {
  const [paymentAmountInput, setPaymentAmountInput] = useState(
    formatPaymentInput(snapshot.activeEvent.paymentAmountCents)
  );
  const [paymentRequiredInput, setPaymentRequiredInput] = useState(
    snapshot.activeEvent.paymentRequiredForQueue
  );
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [stripeTestMessage, setStripeTestMessage] = useState<string | null>(null);
  const [stripeTestRunning, setStripeTestRunning] = useState(false);
  const paymentAmountCents = parseDollarAmountToCents(paymentAmountInput);
  const paymentAmountIsValid =
    !paymentRequiredInput ||
    (paymentAmountCents !== null && paymentAmountCents >= STRIPE_MIN_PAYMENT_AMOUNT_CENTS);

  async function savePaymentSettings(): Promise<void> {
    if (!paymentAmountIsValid) {
      setPaymentMessage("Set an entrance fee of at least $0.50 before requiring payment.");
      return;
    }

    await updateEventPaymentConfig({
      paymentRequiredForQueue: paymentRequiredInput,
      paymentAmountCents: paymentAmountCents,
      paymentCurrency: snapshot.activeEvent.paymentCurrency
    });
    setPaymentMessage("Payment settings saved.");
  }

  async function runStripeConnectionTest(): Promise<void> {
    setStripeTestRunning(true);
    setStripeTestMessage(null);
    try {
      const result = await testStripeConnection();
      const requestHint = result.requestId ? ` Request ID: ${result.requestId}.` : "";
      setStripeTestMessage(`${result.message}${requestHint}`);
    } catch (error) {
      setStripeTestMessage(
        error instanceof Error ? error.message : "Could not test the Stripe connection."
      );
    } finally {
      setStripeTestRunning(false);
    }
  }

  return (
    <Panel title="Event Payments">
      <div className="form-grid">
        <label>
          Entrance fee
          <TextInput
            value={paymentAmountInput}
            onChange={(event) => {
              setPaymentAmountInput(event.target.value);
              setPaymentMessage(null);
            }}
            placeholder="10.00"
          />
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={paymentRequiredInput}
            onChange={(event) => {
              setPaymentRequiredInput(event.target.checked);
              setPaymentMessage(null);
            }}
          />
          Require entrance fee before racer queue signup
        </label>
        <div className="stat-grid">
          <StatPill
            label="Current Fee"
            value={formatPaymentAmount(
              snapshot.activeEvent.paymentAmountCents,
              snapshot.activeEvent.paymentCurrency
            )}
          />
          <StatPill
            label="Stripe"
            value={snapshot.paymentProvider.stripe.configured ? "Ready" : "Needs Setup"}
          />
          <StatPill
            label="Stripe Secret"
            value={snapshot.paymentProvider.stripe.hasSecretKey ? "Set" : "Missing"}
          />
          <StatPill
            label="Webhook Secret"
            value={snapshot.paymentProvider.stripe.hasWebhookSecret ? "Set" : "Missing"}
          />
          <StatPill
            label="Extra CA"
            value={snapshot.paymentProvider.stripe.hasExtraCaCertFile ? "Set" : "Not Set"}
          />
        </div>
        <p>{snapshot.paymentProvider.stripe.message}</p>
        {snapshot.paymentProvider.stripe.publicRacerUrl ? (
          <p>Checkout return URL: {snapshot.paymentProvider.stripe.publicRacerUrl}/racer</p>
        ) : null}
        {paymentMessage ? (
          <p className={paymentAmountIsValid ? "form-success" : "form-error"}>{paymentMessage}</p>
        ) : null}
        {stripeTestMessage ? <p>{stripeTestMessage}</p> : null}
        <div className="panel-action-row">
          <Button
            disabled={!paymentAmountIsValid}
            onClick={() => {
              fireAndForget(savePaymentSettings(), "save event payment settings");
            }}
          >
            Save Payment Settings
          </Button>
          <Button
            variant="ghost"
            disabled={stripeTestRunning}
            onClick={() => {
              fireAndForget(runStripeConnectionTest(), "test stripe connection");
            }}
          >
            {stripeTestRunning ? "Testing..." : "Test Stripe Connection"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export function EventTab({
  snapshot,
  settingsThemeLabel,
  activeTournament,
  currentRace,
  competitionLabel,
  newEventName,
  resolvedEventName,
  setNewEventName
}: {
  snapshot: AppSnapshot;
  settingsThemeLabel: string;
  activeTournament: TournamentBundle | null;
  currentRace: RaceRecord | null;
  competitionLabel: string;
  newEventName: string;
  resolvedEventName: string;
  setNewEventName: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="page-grid">
      <Panel
        title="Event Control"
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              fireAndForget(createEvent(resolvedEventName));
            }}
          >
            Start New Event
          </Button>
        }
      >
        <div className="form-row">
          <TextInput
            value={newEventName}
            onChange={(event) => {
              setNewEventName(event.target.value);
            }}
            placeholder="Friday Finals"
          />
          <Button
            onClick={() => {
              fireAndForget(createEvent(resolvedEventName));
            }}
          >
            Create Event
          </Button>
        </div>
        <div className="stat-grid">
          <StatPill label="Active Event" value={snapshot.activeEvent.name} />
          <StatPill label="Racers" value={snapshot.racers.length} />
          <StatPill label="Upcoming" value={snapshot.queue.length} />
        </div>
      </Panel>

      <EventPaymentsPanel key={snapshot.activeEvent.id} snapshot={snapshot} />

      <Panel title="Session Snapshot">
        <div className="stat-grid">
          <StatPill label="Competition" value={competitionLabel} />
          <StatPill label="Theme" value={settingsThemeLabel} />
          <StatPill
            label="Tournaments"
            value={
              activeTournament
                ? `${snapshot.tournaments.length} total · active`
                : snapshot.tournaments.length
            }
          />
          <StatPill label="Tunnel" value={snapshot.tunnel.status} />
        </div>
        <div className="stack-sm">
          {currentRace ? (
            <span>
              {`${currentRace.state.toUpperCase()} · ${formatRacerNames(
                snapshot,
                currentRace.participants.map((participant) => participant.racerId)
              )}`}
            </span>
          ) : (
            <EmptyState
              title="No race is currently staged"
              body="Queue or stage a race from the Race Desk when you are ready to run the next heat."
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
