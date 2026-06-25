import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord, Racer, RacerQueueSignupResponse } from "@roller-rumble/shared/types";
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
    identities: email
      ? [{ id: `${id}-email`, racerId: id, type: "email", value: email, createdAt: timestamp }]
      : []
  };
}

function makeStore() {
  const racers = new Map<string, Racer>();
  const payments = new Map<string, { status: "unpaid" | "paid" | "waived" }>();
  const paymentRecords = new Map<string, Record<string, unknown>>();
  const activeEvent: EventRecord = {
    id: "event-1",
    name: "Test Event",
    includeAllRaceData: false,
    paymentRequiredForQueue: false,
    paymentAmountCents: null,
    paymentCurrency: "usd",
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const db = {
    getActiveEvent: vi.fn(() => activeEvent),
    getRacer: vi.fn((racerId: string) => racers.get(racerId) ?? null),
    ensureEventRegistration: vi.fn(),
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

  return { db, racers, payments, paymentRecords, activeEvent };
}

type Store = ReturnType<typeof makeStore>;

function newPayment(store: Store): PaymentService {
  return new PaymentService(store.db as unknown as PaymentStore);
}

// Orchestration tests drive the methods RollerRumbleApp keeps (the queue cascade
// and webhook coordination) against a real PaymentService leaf, matching the
// prototype-rebind idiom used elsewhere for app-method tests.
interface OrchestrationTarget {
  db: Store["db"];
  payment: PaymentService;
  emitSnapshot: ReturnType<typeof vi.fn>;
  getSnapshot: ReturnType<typeof vi.fn>;
  signUpQueue: ReturnType<typeof vi.fn>;
}

function makeTarget(store: Store): OrchestrationTarget {
  const target: OrchestrationTarget = {
    db: store.db,
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

const signUpQueueForRacer = getPrototypeMethod("signUpQueueForRacer") as QueueAsRacer;
const handleStripeWebhook = getPrototypeMethod("handleStripeWebhook") as StripeWebhookHandler;

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
    await expect(
      payment.createCheckoutForQueue(racer, { requestedType: "solo" })
    ).rejects.toMatchObject({
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

describe("RollerRumbleApp payment orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeMock.checkout.sessions.create = vi.fn(async () => ({
      id: "cs_test_fake",
      url: "https://checkout.stripe.test/session"
    }));
    stripeMock.balance.retrieve = vi.fn(async () => ({}));
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
