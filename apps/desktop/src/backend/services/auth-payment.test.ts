import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type {
  AppSnapshot,
  EventRecord,
  Racer,
  StripeConnectionTestResult,
  RacerQueueSignupResponse
} from "@roller-rumble/shared/types";
import { AppHttpError, RollerRumbleApp } from "./app";

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn(async () => ({
    challenge: "auth-challenge"
  })),
  generateRegistrationOptions: vi.fn(async () => ({
    challenge: "registration-challenge"
  })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: {
      credentialID: "credential-1",
      newCounter: 2,
      userVerified: true,
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
      origin: "http://localhost:3187",
      rpID: "localhost"
    }
  })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credential: {
        id: "credential-1",
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ["internal"]
      },
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true
    }
  }))
}));

interface FakeCredential {
  id: string;
  racerId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface FakeTarget {
  db: {
    findRacerByIdentity: ReturnType<typeof vi.fn>;
    listPasskeyCredentialsForRacer: ReturnType<typeof vi.fn>;
    getPasskeyCredentialByCredentialId: ReturnType<typeof vi.fn>;
    updatePasskeyCredentialUse: ReturnType<typeof vi.fn>;
    createPasskeyCredential: ReturnType<typeof vi.fn>;
    createOrUpdateRacer: ReturnType<typeof vi.fn>;
    updateRacerRegistration: ReturnType<typeof vi.fn>;
    getRacer: ReturnType<typeof vi.fn>;
    getActiveEvent: ReturnType<typeof vi.fn>;
    ensureEventRegistration: ReturnType<typeof vi.fn>;
    getSetting: ReturnType<typeof vi.fn>;
    setSetting: ReturnType<typeof vi.fn>;
    getAdminSettings: ReturnType<typeof vi.fn>;
    getEventRacerPayment: ReturnType<typeof vi.fn>;
    createPaymentRecord: ReturnType<typeof vi.fn>;
    updatePaymentRecord: ReturnType<typeof vi.fn>;
    getPaymentRecord: ReturnType<typeof vi.fn>;
    getPaymentByStripeCheckoutSessionId: ReturnType<typeof vi.fn>;
    updateEventRacerPayment: ReturnType<typeof vi.fn>;
    updateEventPaymentConfig: ReturnType<typeof vi.fn>;
    hasProcessedWebhookEvent: ReturnType<typeof vi.fn>;
    markWebhookEventProcessed: ReturnType<typeof vi.fn>;
  };
  passkeyChallenges: Map<string, { expiresAt: number }>;
  emitSnapshot: ReturnType<typeof vi.fn>;
  getSnapshot: ReturnType<typeof vi.fn>;
  signUpQueue: ReturnType<typeof vi.fn>;
  getStripeConfig: ReturnType<typeof vi.fn>;
  getStripeClient: ReturnType<typeof vi.fn>;
}

type SignInStart = (
  this: FakeTarget,
  email: string,
  context: { origin: string; rpId: string }
) => Promise<unknown>;
type RegistrationStart = (
  this: FakeTarget,
  input: { email: string; displayName: string; phone?: string },
  context: { origin: string; rpId: string },
  sessionRacerId?: string | null
) => Promise<unknown>;
type ChallengeFinish = (
  this: FakeTarget,
  challengeId: string,
  response: unknown
) => Promise<{ racer: Racer; snapshot: AppSnapshot }>;
type SessionTokenCreate = (this: FakeTarget, racerId: string) => string;
type SessionTokenResolve = (this: FakeTarget, token?: string | null) => Racer | null;
type QueueAsRacer = (
  this: FakeTarget,
  racerId: string,
  input: { opponentRacerId?: string; requestedType?: "solo" | "auto-match" }
) => Promise<RacerQueueSignupResponse>;
type StripeWebhookHandler = (
  this: FakeTarget,
  rawBody: Buffer,
  signature?: string
) => { received: true };
type EventPaymentConfigUpdate = (
  this: FakeTarget,
  input: {
    paymentRequiredForQueue: boolean;
    paymentAmountCents?: number | null;
    paymentCurrency?: string;
  }
) => AppSnapshot;
type StripeConnectionTest = (this: FakeTarget) => Promise<StripeConnectionTestResult>;

const passkeyContext = {
  origin: "http://localhost:3187",
  rpId: "localhost"
};
const snapshot = { generatedAt: "now" } as AppSnapshot;
const timestamp = "2026-05-29T00:00:00.000Z";

function makeRacer(id: string, displayName: string, email?: string): Racer {
  return {
    id,
    displayName,
    avatarUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    identities: email
      ? [
          {
            id: `${id}-email`,
            racerId: id,
            type: "email",
            value: email,
            createdAt: timestamp
          }
        ]
      : []
  };
}

function getPrototypeMethod(name: string): unknown {
  const method: unknown = Reflect.get(RollerRumbleApp.prototype, name);
  if (typeof method !== "function") {
    throw new Error(`Missing ${name} implementation`);
  }
  return method;
}

function makeFakeTarget(): FakeTarget & {
  racers: Map<string, Racer>;
  credentials: Map<string, FakeCredential>;
  activeEvent: EventRecord;
  payments: Map<string, { status: "unpaid" | "paid" | "waived" }>;
  paymentRecords: Map<string, Record<string, unknown>>;
} {
  const racers = new Map<string, Racer>();
  const credentials = new Map<string, FakeCredential>();
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
  let sessionSecret: string | null = null;

  const target = {
    racers,
    credentials,
    activeEvent,
    payments,
    paymentRecords,
    passkeyChallenges: new Map<string, { expiresAt: number }>(),
    emitSnapshot: vi.fn(),
    getSnapshot: vi.fn(() => snapshot),
    signUpQueue: vi.fn(() => snapshot),
    getStripeConfig: vi.fn(() => ({
      configured: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      secretKey: "sk_test_fake",
      webhookSecret: "whsec_fake",
      publicRacerUrl: "https://roller-rumble.example",
      message: "Stripe Checkout is ready."
    })),
    getStripeClient: vi.fn(() => ({
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: "cs_test_fake",
            url: "https://checkout.stripe.test/session"
          }))
        }
      },
      balance: {
        retrieve: vi.fn(async () => ({}))
      },
      webhooks: {
        constructEvent: vi.fn()
      }
    })),
    db: {
      findRacerByIdentity: vi.fn((type: string, value: string) => {
        for (const racer of racers.values()) {
          if (
            racer.identities.some((identity) => identity.type === type && identity.value === value)
          ) {
            return racer;
          }
        }
        return null;
      }),
      listPasskeyCredentialsForRacer: vi.fn((racerId: string) =>
        [...credentials.values()].filter((credential) => credential.racerId === racerId)
      ),
      getPasskeyCredentialByCredentialId: vi.fn(
        (credentialId: string) => credentials.get(credentialId) ?? null
      ),
      updatePasskeyCredentialUse: vi.fn((credentialId: string, counter: number) => {
        const credential = credentials.get(credentialId);
        if (credential) {
          credential.counter = counter;
          credential.lastUsedAt = timestamp;
        }
      }),
      createPasskeyCredential: vi.fn(
        (input: Omit<FakeCredential, "id" | "createdAt" | "lastUsedAt">) => {
          const credential = {
            ...input,
            id: `${input.racerId}-credential`,
            createdAt: timestamp,
            lastUsedAt: null
          };
          credentials.set(input.credentialId, credential);
          return credential;
        }
      ),
      createOrUpdateRacer: vi.fn((input: { displayName: string; email?: string }) => {
        const racer = makeRacer(`racer-${racers.size + 1}`, input.displayName, input.email);
        racers.set(racer.id, racer);
        return racer;
      }),
      updateRacerRegistration: vi.fn(
        (racerId: string, input: { displayName: string; email?: string }) => {
          const racer = makeRacer(racerId, input.displayName, input.email);
          racers.set(racer.id, racer);
          return racer;
        }
      ),
      getRacer: vi.fn((racerId: string) => racers.get(racerId) ?? null),
      getActiveEvent: vi.fn(() => activeEvent),
      ensureEventRegistration: vi.fn(),
      getSetting: vi.fn((_key: string, fallback: string | null) => ({
        value: sessionSecret ?? fallback
      })),
      setSetting: vi.fn((_key: string, value: string) => {
        sessionSecret = value;
      }),
      getAdminSettings: vi.fn(() => ({
        maxActiveQueueEntriesPerRacer: 3,
        mode: "open-time-trial"
      })),
      getEventRacerPayment: vi.fn(
        (_eventId: string, racerId: string) => payments.get(racerId) ?? { status: "unpaid" }
      ),
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
      hasProcessedWebhookEvent: vi.fn(() => false),
      markWebhookEventProcessed: vi.fn()
    }
  };

  Object.setPrototypeOf(target, RollerRumbleApp.prototype);
  return target;
}

const startPasskeySignIn = getPrototypeMethod("startPasskeySignIn") as SignInStart;
const startPasskeyRegistration = getPrototypeMethod(
  "startPasskeyRegistration"
) as RegistrationStart;
const finishPasskeyRegistration = getPrototypeMethod(
  "finishPasskeyRegistration"
) as ChallengeFinish;
const finishPasskeySignIn = getPrototypeMethod("finishPasskeySignIn") as ChallengeFinish;
const createRacerSessionToken = getPrototypeMethod("createRacerSessionToken") as SessionTokenCreate;
const getRacerFromSessionToken = getPrototypeMethod(
  "getRacerFromSessionToken"
) as SessionTokenResolve;
const signUpQueueForRacer = getPrototypeMethod("signUpQueueForRacer") as QueueAsRacer;
const handleStripeWebhook = getPrototypeMethod("handleStripeWebhook") as StripeWebhookHandler;
const updateActiveEventPaymentConfig = getPrototypeMethod(
  "updateActiveEventPaymentConfig"
) as EventPaymentConfigUpdate;
const testStripeConnection = getPrototypeMethod("testStripeConnection") as StripeConnectionTest;

describe("passkey racer auth and payment gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a valid current-event amount before enabling payment", () => {
    const target = makeFakeTarget();

    expect(() => {
      updateActiveEventPaymentConfig.call(target, {
        paymentRequiredForQueue: true,
        paymentAmountCents: 49,
        paymentCurrency: "usd"
      });
    }).toThrow(AppHttpError);

    expect(
      updateActiveEventPaymentConfig.call(target, {
        paymentRequiredForQueue: true,
        paymentAmountCents: 1000,
        paymentCurrency: "usd"
      })
    ).toBe(snapshot);
    expect(target.activeEvent.paymentRequiredForQueue).toBe(true);
    expect(target.activeEvent.paymentAmountCents).toBe(1000);
  });

  it("starts registration when no racer exists for the email", async () => {
    const target = makeFakeTarget();

    await expect(
      startPasskeySignIn.call(target, "new@example.com", passkeyContext)
    ).resolves.toEqual({
      status: "register_required",
      email: "new@example.com"
    });
  });

  it("requires host assistance for an existing email with no passkey", async () => {
    const target = makeFakeTarget();
    const racer = makeRacer("racer-1", "Existing Racer", "existing@example.com");
    target.racers.set(racer.id, racer);

    const result = await startPasskeySignIn.call(target, "existing@example.com", passkeyContext);

    expect(result).toMatchObject({ status: "host_assist" });
  });

  it("creates a racer and passkey credential after registration verification", async () => {
    const target = makeFakeTarget();
    const start = await startPasskeyRegistration.call(
      target,
      {
        email: "bird@example.com",
        displayName: "Bird Fast"
      },
      passkeyContext
    );

    expect(start).toMatchObject({ status: "passkey" });
    const challengeId = (start as { challengeId: string }).challengeId;
    const result = await finishPasskeyRegistration.call(target, challengeId, {
      id: "credential-1"
    });

    expect(result.racer.displayName).toBe("Bird Fast");
    expect(result.racer.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "email", value: "bird@example.com" })
      ])
    );
    expect(target.credentials.size).toBe(1);
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: "registration-challenge",
        expectedOrigin: passkeyContext.origin,
        expectedRPID: passkeyContext.rpId
      })
    );
  });

  it("expires passkey challenges instead of accepting stale browser responses", async () => {
    const target = makeFakeTarget();
    const start = await startPasskeyRegistration.call(
      target,
      {
        email: "late@example.com",
        displayName: "Late Racer"
      },
      passkeyContext
    );
    const challengeId = (start as { challengeId: string }).challengeId;
    target.passkeyChallenges.set(challengeId, {
      ...target.passkeyChallenges.get(challengeId)!,
      expiresAt: Date.now() - 1
    });

    await expect(
      finishPasskeyRegistration.call(target, challengeId, { id: "credential-1" })
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("signs in with an existing passkey and updates the credential counter", async () => {
    const target = makeFakeTarget();
    const racer = makeRacer("racer-1", "Counter Racer", "counter@example.com");
    target.racers.set(racer.id, racer);
    target.credentials.set("credential-1", {
      id: "stored-credential",
      racerId: racer.id,
      credentialId: "credential-1",
      publicKey: Buffer.from([1, 2, 3]).toString("base64url"),
      counter: 0,
      transports: ["internal"],
      deviceType: "multiDevice",
      backedUp: true,
      createdAt: timestamp,
      lastUsedAt: null
    });

    const start = await startPasskeySignIn.call(target, "counter@example.com", passkeyContext);
    const result = await finishPasskeySignIn.call(
      target,
      (start as { challengeId: string }).challengeId,
      {
        id: "credential-1"
      }
    );

    expect(result.racer.id).toBe(racer.id);
    expect(target.credentials.get("credential-1")?.counter).toBe(2);
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: "auth-challenge"
      })
    );
  });

  it("round-trips signed racer session tokens", () => {
    const target = makeFakeTarget();
    const racer = makeRacer("racer-1", "Session Racer", "session@example.com");
    target.racers.set(racer.id, racer);

    const token = createRacerSessionToken.call(target, racer.id);

    expect(getRacerFromSessionToken.call(target, token)?.id).toBe(racer.id);
    expect(getRacerFromSessionToken.call(target, `${token}tampered`)).toBeNull();
  });

  it("creates Stripe Checkout for unpaid racer-page queue signup when event payment is required", async () => {
    const target = makeFakeTarget();
    const racer = makeRacer("racer-1", "Payment Racer", "pay@example.com");
    target.racers.set(racer.id, racer);

    await expect(
      signUpQueueForRacer.call(target, racer.id, { requestedType: "solo" })
    ).resolves.toMatchObject({ status: "queued" });

    target.activeEvent.paymentRequiredForQueue = true;
    target.activeEvent.paymentAmountCents = 1000;

    await expect(
      signUpQueueForRacer.call(target, racer.id, { requestedType: "solo" })
    ).resolves.toMatchObject({
      status: "checkout_required",
      checkoutUrl: "https://checkout.stripe.test/session"
    });
  });

  it("records Stripe connection failures during checkout creation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const target = makeFakeTarget();
    const racer = makeRacer("racer-1", "Payment Racer", "pay@example.com");
    const stripeError = Object.assign(
      new Error("An error occurred with our connection to Stripe. Request was retried 2 times."),
      {
        type: "StripeConnectionError",
        requestId: "req_test_123"
      }
    );
    target.racers.set(racer.id, racer);
    target.activeEvent.paymentRequiredForQueue = true;
    target.activeEvent.paymentAmountCents = 1000;
    target.getStripeClient.mockReturnValueOnce({
      checkout: {
        sessions: {
          create: vi.fn(async () => {
            throw stripeError;
          })
        }
      }
    });

    await expect(
      signUpQueueForRacer.call(target, racer.id, { requestedType: "solo" })
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "stripe_connection_failed",
      message: expect.stringContaining("could not reach Stripe") as unknown
    });
    expect(target.paymentRecords.get("payment-1")).toMatchObject({
      status: "failed",
      failureCode: "stripe_connection_failed",
      failureMessage: expect.stringContaining("Request was retried 2 times") as unknown
    });
    warnSpy.mockRestore();
  });

  it("tests the configured Stripe connection", async () => {
    const target = makeFakeTarget();

    await expect(testStripeConnection.call(target)).resolves.toMatchObject({
      ok: true,
      code: "stripe_ready"
    });
  });

  it("allows paid or admin-queued racers when payment is required", async () => {
    const target = makeFakeTarget();
    target.activeEvent.paymentRequiredForQueue = true;
    target.activeEvent.paymentAmountCents = 1000;
    target.racers.set("paid-racer", makeRacer("paid-racer", "Paid Racer", "paid@example.com"));
    target.payments.set("paid-racer", { status: "paid" });

    await expect(
      signUpQueueForRacer.call(target, "paid-racer", { requestedType: "solo" })
    ).resolves.toMatchObject({ status: "queued" });
    expect(() => {
      target.signUpQueue({ racerId: "unpaid-racer", requestedType: "solo" });
    }).not.toThrow();
  });

  it("blocks challenge checkout when the selected opponent has not paid", async () => {
    const target = makeFakeTarget();
    target.activeEvent.paymentRequiredForQueue = true;
    target.activeEvent.paymentAmountCents = 1000;
    target.racers.set("racer-1", makeRacer("racer-1", "Current Racer", "current@example.com"));
    target.racers.set("racer-2", makeRacer("racer-2", "Opponent Racer", "opponent@example.com"));

    await expect(
      signUpQueueForRacer.call(target, "racer-1", { opponentRacerId: "racer-2" })
    ).rejects.toThrow(AppHttpError);
    expect(target.db.createPaymentRecord).not.toHaveBeenCalled();
  });

  it("marks Stripe checkout paid and queues the stored intent from the webhook", () => {
    const target = makeFakeTarget();
    target.activeEvent.paymentRequiredForQueue = true;
    target.activeEvent.paymentAmountCents = 1000;
    target.racers.set("racer-1", makeRacer("racer-1", "Webhook Racer", "webhook@example.com"));
    const paymentId = "payment-1";
    target.db.createPaymentRecord({
      eventId: "event-1",
      racerId: "racer-1",
      amountCents: 1000,
      currency: "usd",
      queueIntent: { requestedType: "solo" }
    });
    target.db.updatePaymentRecord(paymentId, {
      stripeCheckoutSessionId: "cs_test_webhook"
    });
    target.getStripeClient.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: "evt_1",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_webhook",
              metadata: { paymentId },
              payment_intent: "pi_1"
            }
          }
        }))
      }
    });

    expect(handleStripeWebhook.call(target, Buffer.from("{}"), "signature")).toEqual({
      received: true
    });
    expect(target.db.updateEventRacerPayment).toHaveBeenCalledWith("event-1", "racer-1", {
      status: "paid",
      note: "Stripe Checkout",
      providerReference: "pi_1"
    });
    expect(target.signUpQueue).toHaveBeenCalledWith({
      racerId: "racer-1",
      requestedType: "solo",
      opponentRacerId: undefined
    });
    expect(target.db.markWebhookEventProcessed).toHaveBeenCalledWith(
      "stripe",
      "evt_1",
      "checkout.session.completed"
    );
  });

  it("ignores duplicate Stripe webhook deliveries", () => {
    const target = makeFakeTarget();
    target.db.hasProcessedWebhookEvent.mockReturnValue(true);
    target.getStripeClient.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: "evt_duplicate",
          type: "checkout.session.completed",
          data: { object: { id: "cs_duplicate" } }
        }))
      }
    });

    expect(handleStripeWebhook.call(target, Buffer.from("{}"), "signature")).toEqual({
      received: true
    });
    expect(target.db.updateEventRacerPayment).not.toHaveBeenCalled();
    expect(target.signUpQueue).not.toHaveBeenCalled();
    expect(target.db.markWebhookEventProcessed).not.toHaveBeenCalled();
  });
});
