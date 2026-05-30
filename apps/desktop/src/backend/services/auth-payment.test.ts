import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AppSnapshot, Racer } from "@goldsprints/shared/types";
import { AppHttpError, GoldsprintsApp } from "./app";

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
  };
  passkeyChallenges: Map<string, { expiresAt: number }>;
  emitSnapshot: ReturnType<typeof vi.fn>;
  getSnapshot: ReturnType<typeof vi.fn>;
  signUpQueue: ReturnType<typeof vi.fn>;
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
) => AppSnapshot;

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
  const method: unknown = Reflect.get(GoldsprintsApp.prototype, name);
  if (typeof method !== "function") {
    throw new Error(`Missing ${name} implementation`);
  }
  return method;
}

function makeFakeTarget(): FakeTarget & {
  racers: Map<string, Racer>;
  credentials: Map<string, FakeCredential>;
  settings: { paymentRequiredForQueue: boolean };
  payments: Map<string, { status: "unpaid" | "paid" | "waived" }>;
} {
  const racers = new Map<string, Racer>();
  const credentials = new Map<string, FakeCredential>();
  const settings = { paymentRequiredForQueue: false };
  const payments = new Map<string, { status: "unpaid" | "paid" | "waived" }>();
  let sessionSecret: string | null = null;

  const target = {
    racers,
    credentials,
    settings,
    payments,
    passkeyChallenges: new Map<string, { expiresAt: number }>(),
    emitSnapshot: vi.fn(),
    getSnapshot: vi.fn(() => snapshot),
    signUpQueue: vi.fn(() => snapshot),
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
      getActiveEvent: vi.fn(() => ({ id: "event-1" })),
      ensureEventRegistration: vi.fn(),
      getSetting: vi.fn((_key: string, fallback: string | null) => ({
        value: sessionSecret ?? fallback
      })),
      setSetting: vi.fn((_key: string, value: string) => {
        sessionSecret = value;
      }),
      getAdminSettings: vi.fn(() => ({
        paymentRequiredForQueue: settings.paymentRequiredForQueue,
        maxActiveQueueEntriesPerRacer: 3,
        mode: "open-time-trial"
      })),
      getEventRacerPayment: vi.fn(
        (_eventId: string, racerId: string) => payments.get(racerId) ?? { status: "unpaid" }
      )
    }
  };

  Object.setPrototypeOf(target, GoldsprintsApp.prototype);
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

describe("passkey racer auth and payment gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("blocks unpaid racer-page queue signup only when payment is required", () => {
    const target = makeFakeTarget();
    const racer = makeRacer("racer-1", "Payment Racer", "pay@example.com");
    target.racers.set(racer.id, racer);

    expect(() => {
      signUpQueueForRacer.call(target, racer.id, { requestedType: "solo" });
    }).not.toThrow();

    target.settings.paymentRequiredForQueue = true;

    expect(() => {
      signUpQueueForRacer.call(target, racer.id, { requestedType: "solo" });
    }).toThrow(AppHttpError);
  });

  it("allows paid or admin-queued racers when payment is required", () => {
    const target = makeFakeTarget();
    target.settings.paymentRequiredForQueue = true;
    target.payments.set("paid-racer", { status: "paid" });

    expect(() => {
      signUpQueueForRacer.call(target, "paid-racer", { requestedType: "solo" });
    }).not.toThrow();
    expect(() => {
      target.signUpQueue({ racerId: "unpaid-racer", requestedType: "solo" });
    }).not.toThrow();
  });
});
