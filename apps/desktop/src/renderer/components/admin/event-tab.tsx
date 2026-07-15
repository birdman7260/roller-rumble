import { useReducer } from "react";
import type { AppSnapshot, RaceRecord, TournamentBundle } from "@roller-rumble/shared/types";
import {
  Button,
  ConfirmModal,
  EmptyState,
  Panel,
  StatPill,
  TextInput
} from "@roller-rumble/shared-ui";
import { STRIPE_MIN_PAYMENT_AMOUNT_CENTS } from "@roller-rumble/shared/constants";
import {
  createEvent,
  testStripeConnection,
  updateActiveEvent,
  updateEventPaymentConfig
} from "../../lib/api";
import { SIGNUP_PROMPT_DEFAULTS } from "../../lib/signup-prompt-copy";
import { formatRacerNames } from "../../lib/snapshot-display";
import { fireAndForget } from "../../lib/ui-actions";
import { useMasonryGrid } from "../../lib/use-masonry-grid";

const usdPaymentAmountFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD"
});

function formatPaymentAmount(amountCents: number | null | undefined, currency: string): string {
  if (typeof amountCents !== "number") {
    return "Not set";
  }

  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "USD") {
    return usdPaymentAmountFormatter.format(amountCents / 100);
  }

  return `${normalizedCurrency} ${(amountCents / 100).toFixed(2)}`;
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

interface EventPaymentsState {
  paymentAmountDraft: string | null;
  paymentMessage: string | null;
  paymentRequiredDraft: boolean | null;
  stripeTestMessage: string | null;
  stripeTestRunning: boolean;
}

type EventPaymentsAction =
  | { type: "set-payment-amount"; value: string }
  | { type: "set-payment-required"; value: boolean }
  | { type: "set-payment-message"; value: string | null }
  | { type: "set-stripe-test-message"; value: string | null }
  | { type: "set-stripe-test-running"; value: boolean };

const initialEventPaymentsState: EventPaymentsState = {
  paymentAmountDraft: null,
  paymentMessage: null,
  paymentRequiredDraft: null,
  stripeTestMessage: null,
  stripeTestRunning: false
};

function eventPaymentsReducer(
  state: EventPaymentsState,
  action: EventPaymentsAction
): EventPaymentsState {
  switch (action.type) {
    case "set-payment-amount":
      return { ...state, paymentAmountDraft: action.value, paymentMessage: null };
    case "set-payment-required":
      return { ...state, paymentRequiredDraft: action.value, paymentMessage: null };
    case "set-payment-message":
      return { ...state, paymentMessage: action.value };
    case "set-stripe-test-message":
      return { ...state, stripeTestMessage: action.value };
    case "set-stripe-test-running":
      return { ...state, stripeTestRunning: action.value };
    default:
      return state;
  }
}

function EventPaymentsPanel({ snapshot }: { snapshot: AppSnapshot }) {
  const [state, dispatch] = useReducer(eventPaymentsReducer, initialEventPaymentsState);
  const paymentAmountInput =
    state.paymentAmountDraft ?? formatPaymentInput(snapshot.activeEvent.paymentAmountCents);
  const paymentRequiredInput =
    state.paymentRequiredDraft ?? snapshot.activeEvent.paymentRequiredForQueue;
  const paymentAmountInputId = "event-payment-amount";
  const paymentAmountCents = parseDollarAmountToCents(paymentAmountInput);
  const paymentAmountIsValid =
    !paymentRequiredInput ||
    (paymentAmountCents !== null && paymentAmountCents >= STRIPE_MIN_PAYMENT_AMOUNT_CENTS);

  async function savePaymentSettings(): Promise<void> {
    if (!paymentAmountIsValid) {
      dispatch({
        type: "set-payment-message",
        value: "Set an entrance fee of at least $0.50 before requiring payment."
      });
      return;
    }

    await updateEventPaymentConfig({
      paymentRequiredForQueue: paymentRequiredInput,
      paymentAmountCents: paymentAmountCents,
      paymentCurrency: snapshot.activeEvent.paymentCurrency
    });
    dispatch({ type: "set-payment-message", value: "Payment settings saved." });
  }

  async function runStripeConnectionTest(): Promise<void> {
    dispatch({ type: "set-stripe-test-running", value: true });
    dispatch({ type: "set-stripe-test-message", value: null });
    try {
      const result = await testStripeConnection();
      const requestHint = result.requestId ? ` Request ID: ${result.requestId}.` : "";
      dispatch({ type: "set-stripe-test-message", value: `${result.message}${requestHint}` });
    } catch (error) {
      dispatch({
        type: "set-stripe-test-message",
        value: error instanceof Error ? error.message : "Could not test the Stripe connection."
      });
    } finally {
      dispatch({ type: "set-stripe-test-running", value: false });
    }
  }

  return (
    <Panel title="Event Payments">
      <div className="form-grid">
        <label htmlFor={paymentAmountInputId}>
          Entrance fee
          <TextInput
            id={paymentAmountInputId}
            value={paymentAmountInput}
            onChange={(event) => {
              dispatch({ type: "set-payment-amount", value: event.target.value });
            }}
            placeholder="10.00"
          />
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={paymentRequiredInput}
            onChange={(event) => {
              dispatch({ type: "set-payment-required", value: event.target.checked });
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
        {state.paymentMessage ? (
          <p className={paymentAmountIsValid ? "form-success" : "form-error"}>
            {state.paymentMessage}
          </p>
        ) : null}
        {state.stripeTestMessage ? <p>{state.stripeTestMessage}</p> : null}
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
            disabled={state.stripeTestRunning}
            onClick={() => {
              fireAndForget(runStripeConnectionTest(), "test stripe connection");
            }}
          >
            {state.stripeTestRunning ? "Testing..." : "Test Stripe Connection"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

interface EventDetailsState {
  name: string;
  description: string;
  eyebrow: string;
  heading: string;
  confirmOpen: boolean;
  busy: boolean;
}

function eventDetailsReducer(
  state: EventDetailsState,
  patch: Partial<EventDetailsState>
): EventDetailsState {
  return { ...state, ...patch };
}

// Keyed by the active event id so the local field state re-initialises whenever
// a different event becomes active (e.g. after "Create New Event").
function EventDetailsPanel({ snapshot }: { snapshot: AppSnapshot }) {
  const activeEvent = snapshot.activeEvent;
  const [state, dispatch] = useReducer(eventDetailsReducer, {
    name: activeEvent.name,
    description: activeEvent.description ?? "",
    eyebrow: activeEvent.signupEyebrow ?? "",
    heading: activeEvent.signupHeading ?? "",
    confirmOpen: false,
    busy: false
  });
  const nameInputId = "event-details-name";
  const descriptionInputId = "event-details-description";
  const eyebrowInputId = "event-details-eyebrow";
  const headingInputId = "event-details-heading";

  const { name, description, eyebrow, heading, confirmOpen, busy } = state;
  const nameIsValid = name.trim().length > 0;

  async function handleUpdate(): Promise<void> {
    if (!nameIsValid) {
      return;
    }
    dispatch({ busy: true });
    try {
      await updateActiveEvent({
        name,
        description,
        signupEyebrow: eyebrow,
        signupHeading: heading
      });
    } finally {
      dispatch({ busy: false });
    }
  }

  async function handleCreate(): Promise<void> {
    if (!nameIsValid) {
      return;
    }
    dispatch({ busy: true });
    try {
      await createEvent(name);
      dispatch({ confirmOpen: false });
    } finally {
      dispatch({ busy: false });
    }
  }

  return (
    <Panel title="Event">
      <div className="stack-sm">
        <label htmlFor={nameInputId}>
          Event name
          <TextInput
            id={nameInputId}
            value={name}
            maxLength={120}
            onChange={(event) => {
              dispatch({ name: event.target.value });
            }}
            placeholder="Friday Finals"
          />
        </label>
        <label htmlFor={descriptionInputId}>
          Description
          <textarea
            id={descriptionInputId}
            rows={3}
            value={description}
            maxLength={500}
            onChange={(event) => {
              dispatch({ description: event.target.value });
            }}
            placeholder={SIGNUP_PROMPT_DEFAULTS.body}
          />
        </label>
        <label htmlFor={eyebrowInputId}>
          Signup eyebrow
          <TextInput
            id={eyebrowInputId}
            value={eyebrow}
            maxLength={80}
            onChange={(event) => {
              dispatch({ eyebrow: event.target.value });
            }}
            placeholder={SIGNUP_PROMPT_DEFAULTS.eyebrow}
          />
        </label>
        <label htmlFor={headingInputId}>
          Signup heading
          <TextInput
            id={headingInputId}
            value={heading}
            maxLength={80}
            onChange={(event) => {
              dispatch({ heading: event.target.value });
            }}
            placeholder={SIGNUP_PROMPT_DEFAULTS.heading}
          />
        </label>
        <div className="button-row">
          <Button
            disabled={!nameIsValid || busy}
            onClick={() => {
              fireAndForget(handleUpdate(), "update event");
            }}
          >
            Update Event
          </Button>
          <Button
            variant="ghost"
            disabled={!nameIsValid || busy}
            onClick={() => {
              dispatch({ confirmOpen: true });
            }}
          >
            Create New Event
          </Button>
        </div>
      </div>
      <div className="stat-grid">
        <StatPill label="Active Event" value={activeEvent.name} />
        <StatPill label="Racers" value={snapshot.racers.length} />
        <StatPill label="Upcoming" value={snapshot.queue.length} />
      </div>
      <ConfirmModal
        open={confirmOpen}
        busy={busy}
        title="Create a new event?"
        body="Are you sure you want to create a new event? This cannot be undone and will mean racers have to register to this new event."
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => {
          fireAndForget(handleCreate(), "create new event");
        }}
        onCancel={() => {
          dispatch({ confirmOpen: false });
        }}
      />
    </Panel>
  );
}

export function EventTab({
  snapshot,
  settingsThemeLabel,
  activeTournament,
  currentRace,
  competitionLabel
}: {
  snapshot: AppSnapshot;
  settingsThemeLabel: string;
  activeTournament: TournamentBundle | null;
  currentRace: RaceRecord | null;
  competitionLabel: string;
}) {
  const gridRef = useMasonryGrid();
  return (
    <div ref={gridRef} className="page-grid page-grid--masonry">
      <EventDetailsPanel key={snapshot.activeEvent.id} snapshot={snapshot} />

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
