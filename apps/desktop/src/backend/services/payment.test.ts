import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_QUEUE_CLOSED_MESSAGE } from "@roller-rumble/shared/constants";
import type {
  EventRecord,
  Racer,
  RacerEntryCheckoutResponse,
  RacerQueueSignupResponse
} from "@roller-rumble/shared/types";
import { AuthService, type AuthStore } from "./auth";
import { AppHttpError } from "./http-error";
import { PaymentService, type PaymentStore } from "./payment";
import { RollerRumbleApp } from "./app";
import type * as StripePaymentsModule from "./stripe-payments";

// Shared, mutable mock seams. `vi.hoisted` makes them available inside the
// hoisted `vi.mock` factories below while staying reassignable per test.
const { stripeMock, fakeConfig } = vi.hoisted(() => ({
  stripeMock: {
    checkout: { sessions: { create: vi.fn() } },
    balance: { retrieve: vi.fn() },
    refunds: { create: vi.fn(), retrieve: vi.fn() },
    webhooks: { constructEvent: vi.fn() }
  },
  fakeConfig: {
    configured: true,
    hasSecretKey: true,
    hasWebhookSecret: true,
    hasExtraCaCertFile: false,
    extraCaCertFile: null as string | null,
    secretKey: "sk_test_fake",
    webhookSecret: "whsec_fake",
    publicRacerUrl: "https://roller-rumble.example",
    message: "Stripe Checkout is ready."
  }
}));

vi.mock("stripe", () => ({ default: vi.fn(() => stripeMock) }));

vi.mock("./stripe-payments", async (importActual) => {
  const actual = await importActual<typeof StripePaymentsModule>();
  return { ...actual, getStripeRuntimeConfig: () => fakeConfig };
});

const snapshot = { generatedAt: "now" } as never;
const timestamp = "2026-05-29T00:00:00.000Z";

function makeRacer(id: string, displayName: string, email?: string): Racer {
  return {
    id,
    displayName,
    avatarUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    realName: null,
    email: email ?? null,
    phone: null
  };
}

function makeStore() {
  const racers = new Map<string, Racer>();
  const payments = new Map<string, { status: "unpaid" | "paid" | "waived" }>();
  const paymentRecords = new Map<string, Record<string, unknown>>();
  const results: { eventId: string; racerId: string }[] = [];
  const activeEvent: EventRecord = {
    id: "event-1",
    name: "Test Event",
    includeAllRaceData: false,
    paymentRequiredForQueue: false,
    paymentAmountCents: null,
    paymentCurrency: "usd",
    registrationLimit: null,
    tournamentStartsAt: null,
    tournamentStartCheckDismissedAt: null,
    plannedBracketSize: null,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const db = {
    getActiveEvent: vi.fn(() => activeEvent),
    getAdminSettings: vi.fn(() => ({
      queueOpen: true,
      allowSoloQueue: true,
      queueClosedMessage: ""
    })),
    getRacer: vi.fn((racerId: string) => racers.get(racerId) ?? null),
    ensureEventRegistration: vi.fn(),
    // Every racer here counts as already in the event, so the registration limit never applies.
    isRegisteredForEvent: vi.fn(() => true),
    countEventRacers: vi.fn(() => 0),
    listQueueEntries: vi.fn(() => []),
    getEventRacerPayment: vi.fn(
      (_eventId: string, racerId: string) => payments.get(racerId) ?? { status: "unpaid" }
    ),
    updateEventRacerPayment: vi.fn(
      (_eventId: string, racerId: string, input: { status: "unpaid" | "paid" | "waived" }) => {
        payments.set(racerId, { status: input.status });
        return payments.get(racerId);
      }
    ),
    updateEventPaymentConfig: vi.fn((_eventId: string, input: Partial<EventRecord>) => {
      Object.assign(activeEvent, input);
      return activeEvent;
    }),
    createPaymentRecord: vi.fn((input: Record<string, unknown>) => {
      const record = {
        ...input,
        id: `payment-${paymentRecords.size + 1}`,
        provider: "stripe",
        status: "checkout_created",
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        checkoutUrl: null,
        failureCode: null,
        failureMessage: null,
        completedAt: null,
        refundAttempt: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      paymentRecords.set(record.id, record);
      return record;
    }),
    updatePaymentRecord: vi.fn((paymentId: string, patch: Record<string, unknown>) => {
      const existing = paymentRecords.get(paymentId);
      if (!existing) {
        throw new Error("missing payment");
      }
      const next = { ...existing, ...patch, updatedAt: timestamp };
      paymentRecords.set(paymentId, next);
      return next;
    }),
    getPaymentRecord: vi.fn((paymentId: string) => paymentRecords.get(paymentId) ?? null),
    listEventPaymentRecords: vi.fn((eventId: string) =>
      [...paymentRecords.values()].filter((record) => record.eventId === eventId)
    ),
    listResults: vi.fn((eventId: string) => results.filter((result) => result.eventId === eventId)),
    getPaymentByStripeCheckoutSessionId: vi.fn((sessionId: string) => {
      for (const record of paymentRecords.values()) {
        if (record.stripeCheckoutSessionId === sessionId) {
          return record;
        }
      }
      return null;
    }),
    hasProcessedWebhookEvent: vi.fn(() => false),
    markWebhookEventProcessed: vi.fn()
  };

  return { db, racers, payments, paymentRecords, results, activeEvent };
}

type Store = ReturnType<typeof makeStore>;

function newPayment(store: Store): PaymentService {
  return new PaymentService(store.db as unknown as PaymentStore);
}

/** Registers a racer whose Stripe Checkout for the active event completed. */
function seedStripePaidRacer(
  store: Store,
  racerId: string,
  displayName: string,
  paymentIntentId: string | null = `pi_${racerId}`
): string {
  store.racers.set(racerId, makeRacer(racerId, displayName));
  const record = store.db.createPaymentRecord({
    eventId: store.activeEvent.id,
    racerId,
    amountCents: 1000,
    currency: "usd",
    queueIntent: null
  });
  store.db.updatePaymentRecord(record.id, {
    status: "paid",
    stripePaymentIntentId: paymentIntentId
  });
  store.payments.set(racerId, { status: "paid" });
  return record.id;
}

// Orchestration tests drive the methods RollerRumbleApp keeps (the queue cascade
// and webhook coordination) against a real PaymentService leaf, matching the
// prototype-rebind idiom used elsewhere for app-method tests.
interface OrchestrationTarget {
  db: Store["db"];
  auth: AuthService;
  payment: PaymentService;
  emitSnapshot: ReturnType<typeof vi.fn>;
  getSnapshot: ReturnType<typeof vi.fn>;
  signUpQueue: ReturnType<typeof vi.fn>;
}

function makeTarget(store: Store): OrchestrationTarget {
  const target: OrchestrationTarget = {
    db: store.db,
    auth: new AuthService(store.db as unknown as AuthStore),
    payment: newPayment(store),
    emitSnapshot: vi.fn(),
    getSnapshot: vi.fn(() => snapshot),
    signUpQueue: vi.fn(() => snapshot)
  };
  Object.setPrototypeOf(target, RollerRumbleApp.prototype);
  return target;
}

function getPrototypeMethod(name: string): unknown {
  const method: unknown = Reflect.get(RollerRumbleApp.prototype, name);
  if (typeof method !== "function") {
    throw new Error(`Missing ${name} implementation`);
  }
  return method;
}

type QueueAsRacer = (
  this: OrchestrationTarget,
  racerId: string,
  input: { opponentRacerId?: string; requestedType?: "solo" | "auto-match" }
) => Promise<RacerQueueSignupResponse>;
type StripeWebhookHandler = (
  this: OrchestrationTarget,
  rawBody: Buffer,
  signature?: string
) => { received: true };

type StartEntryCheckout = (
  this: OrchestrationTarget,
  racerId: string
) => Promise<RacerEntryCheckoutResponse>;

const signUpQueueForRacer = getPrototypeMethod("signUpQueueForRacer") as QueueAsRacer;
const startEntryCheckoutForRacer = getPrototypeMethod(
  "startEntryCheckoutForRacer"
) as StartEntryCheckout;
const handleStripeWebhook = getPrototypeMethod("handleStripeWebhook") as StripeWebhookHandler;

/** Reviews the refunds and confirms every one, as the host does from the Refunds card. */
async function refundEveryReviewedPayment(payment: PaymentService) {
  const { candidates } = await payment.previewUnracedRefunds();
  return payment.refundUnracedPayments(candidates.map((candidate) => candidate.paymentId));
}

/** The idempotency key of every refund request sent to Stripe so far. */
function refundIdempotencyKeys(): string[] {
  return (
    stripeMock.refunds.create.mock.calls as unknown as [unknown, { idempotencyKey: string }][]
  ).map(([, options]) => options.idempotencyKey);
}

/** Stripe accepts every refund and settles it at once, naming it after its payment. */
function settledRefund() {
  return vi.fn(async (params: { metadata: { paymentId: string } }) => ({
    id: `re_${params.metadata.paymentId}`,
    status: "succeeded"
  }));
}

describe("PaymentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeMock.checkout.sessions.create = vi.fn(async () => ({
      id: "cs_test_fake",
      url: "https://checkout.stripe.test/session"
    }));
    stripeMock.balance.retrieve = vi.fn(async () => ({}));
    stripeMock.webhooks.constructEvent = vi.fn();
  });

  it("requires a valid current-event amount before enabling payment", () => {
    const store = makeStore();
    const payment = newPayment(store);

    expect(() => {
      payment.updateActiveEventPaymentConfig({
        paymentRequiredForQueue: true,
        paymentAmountCents: 49,
        paymentCurrency: "usd"
      });
    }).toThrow(AppHttpError);

    payment.updateActiveEventPaymentConfig({
      paymentRequiredForQueue: true,
      paymentAmountCents: 1000,
      paymentCurrency: "usd"
    });
    expect(store.activeEvent.paymentRequiredForQueue).toBe(true);
    expect(store.activeEvent.paymentAmountCents).toBe(1000);
  });

  it("records Stripe connection failures during checkout creation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = makeStore();
    store.activeEvent.paymentRequiredForQueue = true;
    store.activeEvent.paymentAmountCents = 1000;
    const racer = makeRacer("racer-1", "Payment Racer", "pay@example.com");
    const stripeError = Object.assign(
      new Error("An error occurred with our connection to Stripe. Request was retried 2 times."),
      { type: "StripeConnectionError", requestId: "req_test_123" }
    );
    stripeMock.checkout.sessions.create = vi.fn(async () => {
      throw stripeError;
    });

    const payment = newPayment(store);
    await expect(payment.createCheckout(racer, { requestedType: "solo" })).rejects.toMatchObject({
      statusCode: 502,
      code: "stripe_connection_failed",
      message: expect.stringContaining("could not reach Stripe") as unknown
    });
    expect(store.paymentRecords.get("payment-1")).toMatchObject({
      status: "failed",
      failureCode: "stripe_connection_failed",
      failureMessage: expect.stringContaining("Request was retried 2 times") as unknown
    });
    warnSpy.mockRestore();
  });

  it("tests the configured Stripe connection", async () => {
    const store = makeStore();
    const payment = newPayment(store);

    await expect(payment.testStripeConnection()).resolves.toMatchObject({
      ok: true,
      code: "stripe_ready"
    });
  });
});

describe("PaymentService end-of-event refunds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeMock.refunds.create = settledRefund();
    stripeMock.refunds.retrieve = vi.fn(async (id: string) => ({
      id,
      status: "pending",
      metadata: {}
    }));
  });

  it("offers a refund to every Stripe-paid racer with no finished race result", async () => {
    const store = makeStore();
    seedStripePaidRacer(store, "raced", "Raced Racer");
    store.results.push({ eventId: "event-1", racerId: "raced" });
    const unracedPaymentId = seedStripePaidRacer(store, "unraced", "Unraced Racer");
    store.racers.set("abandoned", makeRacer("abandoned", "Abandoned Checkout"));
    store.db.createPaymentRecord({
      eventId: "event-1",
      racerId: "abandoned",
      amountCents: 1000,
      currency: "usd",
      queueIntent: null
    });

    await expect(newPayment(store).previewUnracedRefunds()).resolves.toEqual({
      candidates: [
        {
          paymentId: unracedPaymentId,
          racerId: "unraced",
          displayName: "Unraced Racer",
          amountCents: 1000,
          currency: "usd",
          status: "paid",
          failureMessage: null
        }
      ]
    });
  });

  it("refunds each unraced racer through Stripe and records the refund", async () => {
    const store = makeStore();
    const paymentId = seedStripePaidRacer(store, "unraced", "Unraced Racer", "pi_unraced");

    await expect(refundEveryReviewedPayment(newPayment(store))).resolves.toEqual({
      outcomes: [
        {
          paymentId,
          racerId: "unraced",
          displayName: "Unraced Racer",
          amountCents: 1000,
          currency: "usd",
          status: "refunded",
          message: null
        }
      ]
    });
    expect(stripeMock.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_unraced" }),
      { idempotencyKey: `refund-${paymentId}` }
    );
    expect(store.paymentRecords.get(paymentId)).toMatchObject({
      status: "refunded",
      stripeRefundId: `re_${paymentId}`
    });
    expect(store.payments.get("unraced")).toEqual({ status: "refunded" });
    expect((await newPayment(store).previewUnracedRefunds()).candidates).toEqual([]);
  });

  it("keeps refunding the rest when Stripe rejects one refund, and offers it again", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = makeStore();
    const rejectedPaymentId = seedStripePaidRacer(store, "rejected", "Rejected Racer");
    const refundedPaymentId = seedStripePaidRacer(store, "refunded", "Refunded Racer");
    stripeMock.refunds.create = vi.fn(async (params: { metadata: { paymentId: string } }) => {
      if (params.metadata.paymentId === rejectedPaymentId) {
        throw Object.assign(new Error("Charge ch_1 has been disputed."), {
          type: "StripeInvalidRequestError",
          code: "charge_disputed",
          requestId: "req_refund"
        });
      }
      return settledRefund()(params);
    });

    const { outcomes } = await refundEveryReviewedPayment(newPayment(store));

    expect(outcomes.map(({ paymentId, status }) => ({ paymentId, status }))).toEqual([
      { paymentId: rejectedPaymentId, status: "refund_failed" },
      { paymentId: refundedPaymentId, status: "refunded" }
    ]);
    expect(outcomes[0]?.message).toContain("Charge ch_1 has been disputed.");
    expect(store.paymentRecords.get(rejectedPaymentId)).toMatchObject({
      status: "refund_failed",
      failureCode: "charge_disputed"
    });
    expect(store.payments.get("rejected")).toEqual({ status: "paid" });
    expect((await newPayment(store).previewUnracedRefunds()).candidates).toEqual([
      expect.objectContaining({ paymentId: rejectedPaymentId, status: "refund_failed" })
    ]);
    warnSpy.mockRestore();
  });

  it("retries a refund Stripe refused outright as a new request, not a replay of the refusal", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = makeStore();
    seedStripePaidRacer(store, "unraced", "Unraced Racer");
    const payment = newPayment(store);
    stripeMock.refunds.create.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Insufficient balance to refund."), {
        type: "StripeInvalidRequestError",
        code: "balance_insufficient",
        statusCode: 400
      });
    });
    await refundEveryReviewedPayment(payment);

    await refundEveryReviewedPayment(payment);

    const [firstKey, retryKey] = refundIdempotencyKeys();
    expect(retryKey).not.toBe(firstKey);
    expect(store.payments.get("unraced")).toEqual({ status: "refunded" });
    warnSpy.mockRestore();
  });

  it("retries a refund whose request never reached Stripe with the same idempotency key", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = makeStore();
    seedStripePaidRacer(store, "unraced", "Unraced Racer");
    const payment = newPayment(store);
    stripeMock.refunds.create.mockImplementationOnce(async () => {
      throw Object.assign(new Error("An error occurred with our connection to Stripe."), {
        type: "StripeConnectionError"
      });
    });
    await refundEveryReviewedPayment(payment);

    await refundEveryReviewedPayment(payment);

    const [firstKey, retryKey] = refundIdempotencyKeys();
    expect(retryKey).toBe(firstKey);
    warnSpy.mockRestore();
  });

  it("records a payment Stripe says is already refunded as refunded", async () => {
    const store = makeStore();
    const paymentId = seedStripePaidRacer(store, "unraced", "Unraced Racer");
    stripeMock.refunds.create.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Charge ch_1 has already been refunded."), {
        type: "StripeInvalidRequestError",
        code: "charge_already_refunded",
        statusCode: 400
      });
    });

    const { outcomes } = await refundEveryReviewedPayment(newPayment(store));

    expect(outcomes).toEqual([expect.objectContaining({ paymentId, status: "refunded" })]);
    expect(store.paymentRecords.get(paymentId)).toMatchObject({ status: "refunded" });
    expect(store.payments.get("unraced")).toEqual({ status: "refunded" });
  });

  it("sends the host to the Stripe Dashboard when a payment has no Stripe payment reference", async () => {
    const store = makeStore();
    const paymentId = seedStripePaidRacer(store, "unraced", "Unraced Racer", null);

    const { outcomes } = await refundEveryReviewedPayment(newPayment(store));

    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(outcomes).toEqual([
      expect.objectContaining({
        paymentId,
        status: "refund_failed",
        message: expect.stringContaining("Stripe Dashboard") as unknown
      })
    ]);
    expect(store.paymentRecords.get(paymentId)).toMatchObject({
      status: "refund_failed",
      failureCode: "missing_payment_intent"
    });
  });

  it("holds a refund Stripe has not settled as pending, without offering it again", async () => {
    const store = makeStore();
    const paymentId = seedStripePaidRacer(store, "unraced", "Unraced Racer");
    stripeMock.refunds.create = vi.fn(async () => ({ id: "re_pending", status: "pending" }));

    const { outcomes } = await refundEveryReviewedPayment(newPayment(store));

    expect(outcomes).toEqual([expect.objectContaining({ paymentId, status: "refund_pending" })]);
    expect(store.paymentRecords.get(paymentId)).toMatchObject({
      status: "refund_pending",
      stripeRefundId: "re_pending"
    });
    expect(store.payments.get("unraced")).toEqual({ status: "paid" });
    expect((await newPayment(store).previewUnracedRefunds()).candidates).toEqual([]);
  });

  it("settles a pending refund from Stripe when the host reviews refunds and its webhook never came", async () => {
    const store = makeStore();
    const paymentId = seedStripePaidRacer(store, "unraced", "Unraced Racer");
    const payment = newPayment(store);
    stripeMock.refunds.create.mockImplementationOnce(async () => ({
      id: "re_pending",
      status: "pending"
    }));
    await refundEveryReviewedPayment(payment);
    stripeMock.refunds.retrieve = vi.fn(async () => ({
      id: "re_pending",
      status: "succeeded",
      metadata: { paymentId }
    }));

    await payment.previewUnracedRefunds();

    expect(stripeMock.refunds.retrieve).toHaveBeenCalledWith("re_pending");
    expect(store.paymentRecords.get(paymentId)).toMatchObject({ status: "refunded" });
    expect(store.payments.get("unraced")).toEqual({ status: "refunded" });
  });

  it("refunds only the payments the host reviewed, not ones that became eligible since", async () => {
    const store = makeStore();
    const reviewedPaymentId = seedStripePaidRacer(store, "reviewed", "Reviewed Racer");
    const payment = newPayment(store);
    const { candidates } = await payment.previewUnracedRefunds();
    seedStripePaidRacer(store, "late", "Late Racer");

    const { outcomes } = await payment.refundUnracedPayments(
      candidates.map((candidate) => candidate.paymentId)
    );

    expect(outcomes.map((outcome) => outcome.paymentId)).toEqual([reviewedPaymentId]);
    expect(store.payments.get("late")).toEqual({ status: "paid" });
  });

  it("refuses a second refund run while one is still in progress", async () => {
    const store = makeStore();
    seedStripePaidRacer(store, "unraced", "Unraced Racer");
    const payment = newPayment(store);

    const firstRun = payment.refundUnracedPayments(["payment-1"]);
    await expect(payment.refundUnracedPayments(["payment-1"])).rejects.toMatchObject({
      statusCode: 409,
      code: "refunds_in_progress"
    });
    await firstRun;
    expect(stripeMock.refunds.create).toHaveBeenCalledTimes(1);
  });
});

describe("RollerRumbleApp payment orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeMock.checkout.sessions.create = vi.fn(async () => ({
      id: "cs_test_fake",
      url: "https://checkout.stripe.test/session"
    }));
    stripeMock.balance.retrieve = vi.fn(async () => ({}));
    stripeMock.refunds.create = settledRefund();
    stripeMock.refunds.retrieve = vi.fn(async (id: string) => ({
      id,
      status: "pending",
      metadata: {}
    }));
    stripeMock.webhooks.constructEvent = vi.fn();
  });

  it("creates Stripe Checkout for an unpaid racer when event payment is required", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    const racer = makeRacer("racer-1", "Payment Racer", "pay@example.com");
    store.racers.set(racer.id, racer);

    await expect(
      signUpQueueForRacer.call(target, racer.id, { requestedType: "solo" })
    ).resolves.toMatchObject({ status: "queued" });

    store.activeEvent.paymentRequiredForQueue = true;
    store.activeEvent.paymentAmountCents = 1000;

    await expect(
      signUpQueueForRacer.call(target, racer.id, { requestedType: "solo" })
    ).resolves.toMatchObject({
      status: "checkout_required",
      checkoutUrl: "https://checkout.stripe.test/session"
    });
  });

  it("queues paid racers directly when payment is required", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.activeEvent.paymentRequiredForQueue = true;
    store.activeEvent.paymentAmountCents = 1000;
    store.racers.set("paid-racer", makeRacer("paid-racer", "Paid Racer", "paid@example.com"));
    store.payments.set("paid-racer", { status: "paid" });

    await expect(
      signUpQueueForRacer.call(target, "paid-racer", { requestedType: "solo" })
    ).resolves.toMatchObject({ status: "queued" });
  });

  it("blocks challenge checkout when the selected opponent has not paid", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.activeEvent.paymentRequiredForQueue = true;
    store.activeEvent.paymentAmountCents = 1000;
    store.racers.set("racer-1", makeRacer("racer-1", "Current Racer", "current@example.com"));
    store.racers.set("racer-2", makeRacer("racer-2", "Opponent Racer", "opponent@example.com"));

    await expect(
      signUpQueueForRacer.call(target, "racer-1", { opponentRacerId: "racer-2" })
    ).rejects.toThrow(AppHttpError);
    expect(store.db.createPaymentRecord).not.toHaveBeenCalled();
  });

  it("refuses racer self-service signup with the custom message when the queue is closed", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.db.getAdminSettings.mockReturnValue({
      queueOpen: false,
      allowSoloQueue: true,
      queueClosedMessage: "  Draining for the tournament.  "
    });
    store.racers.set("racer-1", makeRacer("racer-1", "Current Racer", "current@example.com"));

    await expect(
      signUpQueueForRacer.call(target, "racer-1", { requestedType: "solo" })
    ).rejects.toMatchObject({ code: "queue_closed", message: "Draining for the tournament." });
    expect(target.signUpQueue).not.toHaveBeenCalled();
  });

  it("falls back to the default closed message when the operator message is blank", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.db.getAdminSettings.mockReturnValue({
      queueOpen: false,
      allowSoloQueue: true,
      queueClosedMessage: ""
    });
    store.racers.set("racer-1", makeRacer("racer-1", "Current Racer", "current@example.com"));

    await expect(
      signUpQueueForRacer.call(target, "racer-1", { requestedType: "solo" })
    ).rejects.toMatchObject({
      code: "queue_closed",
      message: DEFAULT_QUEUE_CLOSED_MESSAGE
    });
  });

  it("refuses a racer solo run when solo queueing is disabled", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.db.getAdminSettings.mockReturnValue({
      queueOpen: true,
      allowSoloQueue: false,
      queueClosedMessage: ""
    });
    store.racers.set("racer-1", makeRacer("racer-1", "Current Racer", "current@example.com"));

    await expect(
      signUpQueueForRacer.call(target, "racer-1", { requestedType: "solo" })
    ).rejects.toMatchObject({ code: "solo_queue_disabled" });
    expect(target.signUpQueue).not.toHaveBeenCalled();
  });

  it("still lets a racer join the auto-match queue when solo queueing is disabled", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.db.getAdminSettings.mockReturnValue({
      queueOpen: true,
      allowSoloQueue: false,
      queueClosedMessage: ""
    });
    store.racers.set("racer-1", makeRacer("racer-1", "Current Racer", "current@example.com"));

    await signUpQueueForRacer.call(target, "racer-1", { requestedType: "auto-match" });
    expect(target.signUpQueue).toHaveBeenCalled();
  });

  it("marks Stripe checkout paid and queues the stored intent from the webhook", () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.activeEvent.paymentRequiredForQueue = true;
    store.activeEvent.paymentAmountCents = 1000;
    store.racers.set("racer-1", makeRacer("racer-1", "Webhook Racer", "webhook@example.com"));
    const paymentId = "payment-1";
    store.db.createPaymentRecord({
      eventId: "event-1",
      racerId: "racer-1",
      amountCents: 1000,
      currency: "usd",
      queueIntent: { requestedType: "solo" }
    });
    store.db.updatePaymentRecord(paymentId, { stripeCheckoutSessionId: "cs_test_webhook" });
    stripeMock.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_test_webhook", metadata: { paymentId }, payment_intent: "pi_1" }
      }
    }));

    expect(handleStripeWebhook.call(target, Buffer.from("{}"), "signature")).toEqual({
      received: true
    });
    expect(store.db.updateEventRacerPayment).toHaveBeenCalledWith("event-1", "racer-1", {
      status: "paid",
      note: "Stripe Checkout",
      providerReference: "pi_1"
    });
    expect(target.signUpQueue).toHaveBeenCalledWith({
      racerId: "racer-1",
      requestedType: "solo",
      opponentRacerId: undefined
    });
    expect(store.db.markWebhookEventProcessed).toHaveBeenCalledWith(
      "stripe",
      "evt_1",
      "checkout.session.completed"
    );
  });

  it("opens an entry-fee checkout that carries no queue spot, even with the queue closed", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.activeEvent.paymentRequiredForQueue = true;
    store.activeEvent.paymentAmountCents = 1000;
    store.db.getAdminSettings.mockReturnValue({
      queueOpen: false,
      allowSoloQueue: true,
      queueClosedMessage: ""
    });
    store.racers.set("racer-1", makeRacer("racer-1", "Wizard Racer"));

    await expect(startEntryCheckoutForRacer.call(target, "racer-1")).resolves.toEqual({
      paymentId: "payment-1",
      checkoutUrl: "https://checkout.stripe.test/session"
    });
    expect(store.db.ensureEventRegistration).toHaveBeenCalledWith("event-1", "racer-1");
    expect(store.db.createPaymentRecord).toHaveBeenCalledWith(
      expect.objectContaining({ racerId: "racer-1", queueIntent: null })
    );
  });

  it("refuses an entry-fee checkout when the event charges no fee", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.racers.set("racer-1", makeRacer("racer-1", "Wizard Racer"));

    await expect(startEntryCheckoutForRacer.call(target, "racer-1")).rejects.toMatchObject({
      code: "payment_not_required"
    });
    expect(store.db.createPaymentRecord).not.toHaveBeenCalled();
  });

  it("refuses an entry-fee checkout for a racer who already paid or was waived", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.activeEvent.paymentRequiredForQueue = true;
    store.activeEvent.paymentAmountCents = 1000;
    store.racers.set("racer-1", makeRacer("racer-1", "Wizard Racer"));
    store.payments.set("racer-1", { status: "waived" });

    await expect(startEntryCheckoutForRacer.call(target, "racer-1")).rejects.toMatchObject({
      code: "already_paid"
    });
    expect(store.db.createPaymentRecord).not.toHaveBeenCalled();
  });

  it("marks an entry-fee checkout paid from the webhook without queueing the racer", () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.activeEvent.paymentRequiredForQueue = true;
    store.activeEvent.paymentAmountCents = 1000;
    store.racers.set("racer-1", makeRacer("racer-1", "Wizard Racer"));
    const paymentId = "payment-1";
    store.db.createPaymentRecord({
      eventId: "event-1",
      racerId: "racer-1",
      amountCents: 1000,
      currency: "usd",
      queueIntent: null
    });
    stripeMock.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_entry",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_entry", metadata: { paymentId }, payment_intent: "pi_2" } }
    }));

    handleStripeWebhook.call(target, Buffer.from("{}"), "signature");

    expect(store.payments.get("racer-1")).toEqual({ status: "paid" });
    expect(store.paymentRecords.get(paymentId)).toMatchObject({ status: "paid" });
    expect(target.signUpQueue).not.toHaveBeenCalled();
  });

  it("marks a pending refund refunded once Stripe reports it succeeded", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    const paymentId = seedStripePaidRacer(store, "unraced", "Unraced Racer");
    stripeMock.refunds.create = vi.fn(async () => ({ id: "re_pending", status: "pending" }));
    await refundEveryReviewedPayment(target.payment);
    stripeMock.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_refund_settled",
      type: "refund.updated",
      data: { object: { id: "re_pending", status: "succeeded", metadata: { paymentId } } }
    }));

    handleStripeWebhook.call(target, Buffer.from("{}"), "signature");

    expect(store.paymentRecords.get(paymentId)).toMatchObject({ status: "refunded" });
    expect(store.payments.get("unraced")).toEqual({ status: "refunded" });
    expect(target.emitSnapshot).toHaveBeenCalled();
  });

  it("flags a refund Stripe later fails and keeps the racer paid so the host can retry", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    const paymentId = seedStripePaidRacer(store, "unraced", "Unraced Racer");
    await refundEveryReviewedPayment(target.payment);
    stripeMock.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_refund_failed",
      type: "refund.failed",
      data: {
        object: {
          id: `re_${paymentId}`,
          status: "failed",
          failure_reason: "expired_or_canceled_card",
          metadata: { paymentId }
        }
      }
    }));

    handleStripeWebhook.call(target, Buffer.from("{}"), "signature");

    expect(store.paymentRecords.get(paymentId)).toMatchObject({
      status: "refund_failed",
      failureCode: "expired_or_canceled_card"
    });
    expect(store.payments.get("unraced")).toEqual({ status: "paid" });
    expect((await target.payment.previewUnracedRefunds()).candidates).toEqual([
      expect.objectContaining({ paymentId, status: "refund_failed" })
    ]);
  });

  it("retries a refund Stripe failed as a new refund rather than replaying the failed one", async () => {
    const store = makeStore();
    const target = makeTarget(store);
    const paymentId = seedStripePaidRacer(store, "unraced", "Unraced Racer");
    await refundEveryReviewedPayment(target.payment);
    stripeMock.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_refund_failed",
      type: "refund.failed",
      data: { object: { id: `re_${paymentId}`, status: "failed", metadata: { paymentId } } }
    }));
    handleStripeWebhook.call(target, Buffer.from("{}"), "signature");
    stripeMock.refunds.create = vi.fn(async () => ({ id: "re_retry", status: "succeeded" }));

    const { outcomes } = await refundEveryReviewedPayment(target.payment);

    expect(outcomes).toEqual([expect.objectContaining({ paymentId, status: "refunded" })]);
    const [, retryOptions] = stripeMock.refunds.create.mock.lastCall as unknown as [
      unknown,
      { idempotencyKey: string }
    ];
    expect(retryOptions.idempotencyKey).not.toBe(`refund-${paymentId}`);
    expect(store.payments.get("unraced")).toEqual({ status: "refunded" });
  });

  it("ignores duplicate Stripe webhook deliveries", () => {
    const store = makeStore();
    const target = makeTarget(store);
    store.db.hasProcessedWebhookEvent.mockReturnValue(true);
    stripeMock.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_duplicate",
      type: "checkout.session.completed",
      data: { object: { id: "cs_duplicate" } }
    }));

    expect(handleStripeWebhook.call(target, Buffer.from("{}"), "signature")).toEqual({
      received: true
    });
    expect(store.db.updateEventRacerPayment).not.toHaveBeenCalled();
    expect(target.signUpQueue).not.toHaveBeenCalled();
    expect(store.db.markWebhookEventProcessed).not.toHaveBeenCalled();
  });
});
