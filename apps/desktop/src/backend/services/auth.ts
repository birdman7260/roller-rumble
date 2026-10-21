import crypto from "node:crypto";
import type { EventRecord, Racer, RacerRegistrationInput } from "@roller-rumble/shared/types";
import type { AppDatabase } from "../db/Database";
import { AppHttpError } from "./http-error";

const RACER_SESSION_SECRET_SETTING_KEY = "racerSessionSecret";

/**
 * Narrow database port for racer registration and device logins. Expressed as a
 * `Pick<AppDatabase, …>` so it tracks the real signatures at compile time and
 * documents exactly which tables this leaf service touches.
 */
export type AuthStore = Pick<
  AppDatabase,
  | "getSetting"
  | "setSetting"
  | "getRacer"
  | "getActiveEvent"
  | "ensureEventRegistration"
  | "countEventRacers"
  | "isRegisteredForEvent"
  | "createRacer"
  | "updateRacerDetails"
>;

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

/**
 * Leaf module owning racer `registration` and the signed `device login`. It never emits
 * snapshots and never knows the `AppSnapshot` shape: `registerRacer` returns the new `Racer`,
 * and the caller (`RollerRumbleApp`) decides when to broadcast.
 */
export class AuthService {
  constructor(private readonly db: AuthStore) {}

  private getRacerSessionSecret(): string {
    const existing = this.db.getSetting<string | null>(
      RACER_SESSION_SECRET_SETTING_KEY,
      null
    ).value;
    if (existing) {
      return existing;
    }

    const secret = crypto.randomBytes(32).toString("base64url");
    this.db.setSetting(RACER_SESSION_SECRET_SETTING_KEY, secret);
    return secret;
  }

  /**
   * Mint the `device login`: a signature over the racer id. It never expires (ADR-0024), since
   * an expired login would lock the racer out with no way back in.
   */
  createRacerSessionToken(racerId: string): string {
    const payload = encodeBase64UrlJson({ racerId });
    const signature = crypto
      .createHmac("sha256", this.getRacerSessionSecret())
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  getRacerFromSessionToken(token?: string | null): Racer | null {
    if (!token) {
      return null;
    }

    const [payload, signature] = token.split(".");
    if (!payload || !signature) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.getRacerSessionSecret())
      .update(payload)
      .digest("base64url");
    if (!timingSafeEqualString(signature, expectedSignature)) {
      return null;
    }

    try {
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        racerId?: string;
      };
      if (!decoded.racerId) {
        return null;
      }
      return this.db.getRacer(decoded.racerId);
    } catch {
      return null;
    }
  }

  /**
   * A returning phone's racer is entered in the active event when it opens the racer page, unless
   * the event is already full; they stay signed in either way, just outside a full event.
   */
  getRacerAuthSession(token?: string | null): Racer | null {
    const racer = this.getRacerFromSessionToken(token);
    const activeEvent = this.db.getActiveEvent();
    if (
      racer &&
      activeEvent &&
      (this.db.isRegisteredForEvent(activeEvent.id, racer.id) ||
        this.hasRoomToRegister(activeEvent))
    ) {
      this.db.ensureEventRegistration(activeEvent.id, racer.id);
    }
    return racer;
  }

  /**
   * Enters a signed-in racer in the active event for a self-service action that needs them in it
   * (queueing, paying the entry fee), refusing when they are outside an event that is full.
   */
  admitToActiveEvent(racerId: string): void {
    const activeEvent = this.db.getActiveEvent();
    if (!activeEvent) {
      return;
    }
    if (!this.db.isRegisteredForEvent(activeEvent.id, racerId)) {
      this.assertRoomToRegister(activeEvent);
    }
    this.db.ensureEventRegistration(activeEvent.id, racerId);
  }

  private assertRoomToRegister(event: EventRecord): void {
    if (!this.hasRoomToRegister(event)) {
      throw new AppHttpError("Registration for this event is full.", 403, "registration_full");
    }
  }

  /** Whether the event's `registrationLimit` leaves room for one more racer. */
  private hasRoomToRegister(event: EventRecord): boolean {
    return (
      event.registrationLimit === null ||
      this.db.countEventRacers(event.id) < event.registrationLimit
    );
  }

  /**
   * `registration` always inserts a brand-new `racer account` and enters it in the active event.
   * It takes no device login: whatever the phone already holds is never read, so a phone signed
   * in as someone else can't have that account overwritten (ADR-0024).
   */
  registerRacer(input: RacerRegistrationInput): Racer {
    const activeEvent = this.db.getActiveEvent();
    if (activeEvent) {
      this.assertRoomToRegister(activeEvent);
    }
    const racer = this.db.createRacer(input);
    if (activeEvent) {
      this.db.ensureEventRegistration(activeEvent.id, racer.id);
    }
    return racer;
  }

  /**
   * The wizard's Back buttons let a registered racer correct what they typed. The racer id comes
   * from their own device login, so a phone can only ever change its own racer.
   */
  updateRacerDetails(racerId: string, input: RacerRegistrationInput): Racer {
    const racer = this.db.updateRacerDetails(racerId, input);
    if (!racer) {
      throw new Error(`Racer ${racerId} not found.`);
    }
    return racer;
  }
}
