import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { EventRecord, Racer } from "@roller-rumble/shared/types";
import { AuthService, type AuthStore, type PasskeyRequestContext } from "./auth";

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

const passkeyContext: PasskeyRequestContext = {
  origin: "http://localhost:3187",
  rpId: "localhost"
};
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

function makeStore(): AuthStore & {
  racers: Map<string, Racer>;
  credentials: Map<string, FakeCredential>;
  activeEvent: EventRecord;
} {
  const racers = new Map<string, Racer>();
  const credentials = new Map<string, FakeCredential>();
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

  return {
    racers,
    credentials,
    activeEvent,
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
    createRacer: vi.fn((input: { displayName: string; email?: string }) => {
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
    })
  } as unknown as AuthStore & {
    racers: Map<string, Racer>;
    credentials: Map<string, FakeCredential>;
    activeEvent: EventRecord;
  };
}

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts registration when no racer exists for the email", async () => {
    const store = makeStore();
    const auth = new AuthService(store);

    await expect(auth.startPasskeySignIn("new@example.com", passkeyContext)).resolves.toEqual({
      status: "register_required",
      email: "new@example.com"
    });
  });

  it("requires host assistance for an existing email with no passkey", async () => {
    const store = makeStore();
    const auth = new AuthService(store);
    store.racers.set("racer-1", makeRacer("racer-1", "Existing Racer", "existing@example.com"));

    const result = await auth.startPasskeySignIn("existing@example.com", passkeyContext);

    expect(result).toMatchObject({ status: "host_assist" });
  });

  it("creates a racer and passkey credential after registration verification", async () => {
    const store = makeStore();
    const auth = new AuthService(store);
    const start = await auth.startPasskeyRegistration(
      { email: "bird@example.com", displayName: "Bird Fast" },
      passkeyContext
    );

    expect(start).toMatchObject({ status: "passkey" });
    const challengeId = (start as { challengeId: string }).challengeId;
    const racer = await auth.finishPasskeyRegistration(challengeId, { id: "credential-1" });

    expect(racer.displayName).toBe("Bird Fast");
    expect(racer.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "email", value: "bird@example.com" })
      ])
    );
    expect(store.credentials.size).toBe(1);
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: "registration-challenge",
        expectedOrigin: passkeyContext.origin,
        expectedRPID: passkeyContext.rpId
      })
    );
  });

  it("registration always creates a new racer and never rewrites the signed-in one", async () => {
    const store = makeStore();
    const auth = new AuthService(store);
    // A racer is already signed in on this device (e.g. a shared phone).
    store.racers.set("racer-1", makeRacer("racer-1", "Already Here"));

    const start = await auth.startPasskeyRegistration(
      { email: "new@example.com", displayName: "New Person" },
      passkeyContext
    );
    const challengeId = (start as { challengeId: string }).challengeId;
    const racer = await auth.finishPasskeyRegistration(challengeId, { id: "credential-1" });

    expect(racer.id).not.toBe("racer-1");
    expect(racer.displayName).toBe("New Person");
    // The racer that was already signed in is untouched, and a second racer exists.
    expect(store.racers.get("racer-1")?.displayName).toBe("Already Here");
    expect(store.racers.size).toBe(2);
  });

  it("claims an accountless racer by attaching an email and passkey in place", async () => {
    const store = makeStore();
    const auth = new AuthService(store);
    store.racers.set("racer-1", makeRacer("racer-1", "Accountless Ace"));

    const start = await auth.startAccountClaim(
      { email: "ace@example.com", displayName: "Accountless Ace" },
      passkeyContext,
      "racer-1"
    );
    expect(start).toMatchObject({ status: "passkey" });
    const challengeId = (start as { challengeId: string }).challengeId;
    const racer = await auth.finishAccountClaim(challengeId, { id: "credential-1" });

    // Same racer id and history — no new row was created.
    expect(racer.id).toBe("racer-1");
    expect(store.racers.size).toBe(1);
    expect(racer.identities).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "email", value: "ace@example.com" })])
    );
    expect(store.credentials.size).toBe(1);
  });

  it("refuses to claim a racer that already has an email", async () => {
    const store = makeStore();
    const auth = new AuthService(store);
    store.racers.set("racer-1", makeRacer("racer-1", "Secured", "secured@example.com"));

    await expect(
      auth.startAccountClaim(
        { email: "another@example.com", displayName: "Secured" },
        passkeyContext,
        "racer-1"
      )
    ).rejects.toMatchObject({ code: "already_secured" });
  });

  it("routes a claim to host-assist when the email belongs to another racer", async () => {
    const store = makeStore();
    const auth = new AuthService(store);
    store.racers.set("racer-1", makeRacer("racer-1", "Accountless Ace"));
    store.racers.set("racer-2", makeRacer("racer-2", "Owner", "owner@example.com"));

    const result = await auth.startAccountClaim(
      { email: "owner@example.com", displayName: "Accountless Ace" },
      passkeyContext,
      "racer-1"
    );

    expect(result).toMatchObject({ status: "host_assist" });
  });

  it("expires passkey challenges instead of accepting stale browser responses", async () => {
    vi.useFakeTimers();
    try {
      const store = makeStore();
      const auth = new AuthService(store);
      const start = await auth.startPasskeyRegistration(
        { email: "late@example.com", displayName: "Late Racer" },
        passkeyContext
      );
      const challengeId = (start as { challengeId: string }).challengeId;

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      await expect(
        auth.finishPasskeyRegistration(challengeId, { id: "credential-1" })
      ).rejects.toMatchObject({ code: "expired" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("signs in with an existing passkey and updates the credential counter", async () => {
    const store = makeStore();
    const auth = new AuthService(store);
    const racer = makeRacer("racer-1", "Counter Racer", "counter@example.com");
    store.racers.set(racer.id, racer);
    store.credentials.set("credential-1", {
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

    const start = await auth.startPasskeySignIn("counter@example.com", passkeyContext);
    const result = await auth.finishPasskeySignIn((start as { challengeId: string }).challengeId, {
      id: "credential-1"
    });

    expect(result.id).toBe(racer.id);
    expect(store.credentials.get("credential-1")?.counter).toBe(2);
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ expectedChallenge: "auth-challenge" })
    );
  });

  it("round-trips signed racer session tokens", () => {
    const store = makeStore();
    const auth = new AuthService(store);
    const racer = makeRacer("racer-1", "Session Racer", "session@example.com");
    store.racers.set(racer.id, racer);

    const token = auth.createRacerSessionToken(racer.id);

    expect(auth.getRacerFromSessionToken(token)?.id).toBe(racer.id);
    expect(auth.getRacerFromSessionToken(`${token}tampered`)).toBeNull();
  });
});
