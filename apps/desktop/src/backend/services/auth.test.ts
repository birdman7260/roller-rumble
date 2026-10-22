import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreateRacerInput,
  EventRecord,
  Racer,
  RacerRegistrationInput
} from "@roller-rumble/shared/types";
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

function errorThrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the action to throw.");
}

function makeStore(): AuthStore & {
  racers: Map<string, Racer>;
  activeEvent: EventRecord;
  eventRacerIds: Set<string>;
} {
  const racers = new Map<string, Racer>();
  // Who is entered in the active event.
  const eventRacerIds = new Set<string>();
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
  let sessionSecret: string | null = null;

  return {
    racers,
    activeEvent,
    eventRacerIds,
    createRacer: vi.fn((input: CreateRacerInput) => {
      const racer: Racer = {
        ...makeRacer(`racer-${racers.size + 1}`, input.displayName, input.email),
        realName: input.realName ?? null,
        phone: input.phone ?? null
      };
      racers.set(racer.id, racer);
      return racer;
    }),
    updateRacerDetails: vi.fn((racerId: string, input: RacerRegistrationInput) => {
      const existing = racers.get(racerId);
      if (!existing) {
        return null;
      }
      const racer: Racer = { ...existing, ...input };
      racers.set(racerId, racer);
      return racer;
    }),
    getRacer: vi.fn((racerId: string) => racers.get(racerId) ?? null),
    getActiveEvent: vi.fn(() => activeEvent),
    ensureEventRegistration: vi.fn((_eventId: string, racerId: string) => {
      eventRacerIds.add(racerId);
    }),
    countEventRacers: vi.fn(() => eventRacerIds.size),
    isRegisteredForEvent: vi.fn((_eventId: string, racerId: string) => eventRacerIds.has(racerId)),
    getSetting: vi.fn((_key: string, fallback: string | null) => ({
      value: sessionSecret ?? fallback
    })),
    setSetting: vi.fn((_key: string, value: string) => {
      sessionSecret = value;
    })
  } as unknown as AuthStore & {
    racers: Map<string, Racer>;
    activeEvent: EventRecord;
    eventRacerIds: Set<string>;
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

  it("lets a registered racer correct their details without touching anyone else", () => {
    const store = makeStore();
    const auth = new AuthService(store);
    const racer = auth.registerRacer(registration);
    const other = auth.registerRacer({ ...registration, displayName: "Sibling Spinner" });
    const corrected = {
      realName: "Ada King",
      email: "ada.king@example.com",
      phone: "555-010-0199",
      displayName: "Countess Cadence"
    };

    const updated = auth.updateRacerDetails(racer.id, corrected);

    expect(updated).toMatchObject({ id: racer.id, ...corrected });
    expect(store.racers.get(other.id)).toEqual(other);
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

  it("refuses a new registration once the event has reached its registration limit", () => {
    const store = makeStore();
    store.activeEvent.registrationLimit = 2;
    const auth = new AuthService(store);
    auth.registerRacer(registration);
    auth.registerRacer({ ...registration, displayName: "Sibling Spinner" });

    expect(
      errorThrownBy(() => auth.registerRacer({ ...registration, displayName: "Third Wheel" }))
    ).toMatchObject({ statusCode: 403, code: "registration_full" });
    expect(store.racers.size).toBe(2);
    expect(store.eventRacerIds.size).toBe(2);
  });

  it("keeps registering while the event is under its limit or has none", () => {
    const store = makeStore();
    store.activeEvent.registrationLimit = 3;
    const auth = new AuthService(store);

    auth.registerRacer(registration);
    auth.registerRacer({ ...registration, displayName: "Sibling Spinner" });
    store.activeEvent.registrationLimit = null;
    auth.registerRacer({ ...registration, displayName: "Third Wheel" });
    auth.registerRacer({ ...registration, displayName: "Fourth Gear" });

    expect(store.eventRacerIds.size).toBe(4);
  });

  it("does not enter a returning phone's racer in an event that is already full", () => {
    const store = makeStore();
    const auth = new AuthService(store);
    const returning = makeRacer("racer-returning", "Last Year's Champ");
    store.racers.set(returning.id, returning);
    auth.registerRacer(registration);
    store.activeEvent.registrationLimit = 1;

    const session = auth.getRacerAuthSession(auth.createRacerSessionToken(returning.id));

    // The device login still names the racer; they just aren't in this event.
    expect(session?.id).toBe(returning.id);
    expect(store.eventRacerIds.has(returning.id)).toBe(false);
  });

  it("keeps a racer already in a full event signed in and entered", () => {
    const store = makeStore();
    store.activeEvent.registrationLimit = 1;
    const auth = new AuthService(store);
    const racer = auth.registerRacer(registration);

    const session = auth.getRacerAuthSession(auth.createRacerSessionToken(racer.id));

    expect(session?.id).toBe(racer.id);
    expect(store.eventRacerIds.has(racer.id)).toBe(true);
  });

  it("refuses to admit a racer outside a full event, and admits one already in it", () => {
    const store = makeStore();
    const auth = new AuthService(store);
    const entered = auth.registerRacer(registration);
    const outsider = makeRacer("racer-outsider", "Gate Crasher");
    store.racers.set(outsider.id, outsider);
    store.activeEvent.registrationLimit = 1;

    expect(
      errorThrownBy(() => {
        auth.admitToActiveEvent(outsider.id);
      })
    ).toMatchObject({ code: "registration_full" });
    expect(() => {
      auth.admitToActiveEvent(entered.id);
    }).not.toThrow();
    expect([...store.eventRacerIds]).toEqual([entered.id]);
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
