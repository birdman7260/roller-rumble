import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { CreateRacerInput, EventRecord, Racer } from "@roller-rumble/shared/types";
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
    realName: null,
    email: email ?? null,
    phone: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const registration = {
  realName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "555-010-0100",
  displayName: "Countess Crank"
};

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
    // Passkey email lookups mirror the racer's email until passkeys are removed.
    findRacerByIdentity: vi.fn((type: string, value: string) => {
      for (const racer of racers.values()) {
        if (type === "email" && racer.email === value) {
          return racer;
        }
      }
      return null;
    }),
    attachRacerIdentity: vi.fn(),
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
    createRacer: vi.fn((input: CreateRacerInput) => {
      const racer: Racer = {
        ...makeRacer(`racer-${racers.size + 1}`, input.displayName, input.email),
        realName: input.realName ?? null,
        phone: input.phone ?? null
      };
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
    expect(racer.email).toBe("bird@example.com");
    expect(store.attachRacerIdentity).toHaveBeenCalledWith(racer.id, "email", "bird@example.com");
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
    expect(racer.email).toBe("ace@example.com");
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

  it("registers a new racer with contact details and enters them in the active event", () => {
    const store = makeStore();
    const auth = new AuthService(store);

    const racer = auth.registerRacer(registration);

    expect(racer).toMatchObject(registration);
    expect(store.ensureEventRegistration).toHaveBeenCalledWith(store.activeEvent.id, racer.id);
  });

  it("gives two registrations with the same email two racers, two ids, and two device logins", () => {
    const store = makeStore();
    const auth = new AuthService(store);

    const first = auth.registerRacer(registration);
    const second = auth.registerRacer({ ...registration, displayName: "Sibling Spinner" });

    expect(second.id).not.toBe(first.id);
    expect(store.racers.size).toBe(2);
    expect(store.racers.get(first.id)?.displayName).toBe("Countess Crank");
    expect(auth.createRacerSessionToken(first.id)).not.toBe(
      auth.createRacerSessionToken(second.id)
    );
  });

  it("leaves the racer whose device login the phone holds untouched when registering", () => {
    const store = makeStore();
    const auth = new AuthService(store);
    const existing = auth.registerRacer(registration);
    const heldDeviceLogin = auth.createRacerSessionToken(existing.id);

    const racer = auth.registerRacer({
      realName: "Grace Hopper",
      email: "grace@example.com",
      phone: "555-010-0200",
      displayName: "Admiral Pedals"
    });

    expect(racer.id).not.toBe(existing.id);
    expect(store.racers.get(existing.id)).toEqual(existing);
    expect(auth.getRacerFromSessionToken(heldDeviceLogin)?.id).toBe(existing.id);
  });

  it("issues device logins that never expire", () => {
    vi.useFakeTimers();
    try {
      const store = makeStore();
      const auth = new AuthService(store);
      const racer = auth.registerRacer(registration);
      const token = auth.createRacerSessionToken(racer.id);

      const [payload] = token.split(".");
      expect(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).toEqual({
        racerId: racer.id
      });

      vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 365 * 5);
      expect(auth.getRacerFromSessionToken(token)?.id).toBe(racer.id);
    } finally {
      vi.useRealTimers();
    }
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
