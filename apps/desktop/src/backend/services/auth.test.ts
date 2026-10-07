import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateRacerInput, EventRecord, Racer } from "@roller-rumble/shared/types";
import { AuthService, type AuthStore } from "./auth";

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
  activeEvent: EventRecord;
} {
  const racers = new Map<string, Racer>();
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
    activeEvent,
    createRacer: vi.fn((input: CreateRacerInput) => {
      const racer: Racer = {
        ...makeRacer(`racer-${racers.size + 1}`, input.displayName, input.email),
        realName: input.realName ?? null,
        phone: input.phone ?? null
      };
      racers.set(racer.id, racer);
      return racer;
    }),
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
    activeEvent: EventRecord;
  };
}

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
