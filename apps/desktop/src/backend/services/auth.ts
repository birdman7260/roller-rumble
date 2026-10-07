import crypto from "node:crypto";
import type { Racer, RacerRegistrationInput } from "@roller-rumble/shared/types";
import type { AppDatabase } from "../db/Database";

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
  | "createRacer"
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

  getRacerAuthSession(token?: string | null): Racer | null {
    const racer = this.getRacerFromSessionToken(token);
    const activeEvent = this.db.getActiveEvent();
    if (racer && activeEvent) {
      this.db.ensureEventRegistration(activeEvent.id, racer.id);
    }
    return racer;
  }

  /**
   * `registration` always inserts a brand-new `racer account` and enters it in the active event.
   * It takes no device login: whatever the phone already holds is never read, so a phone signed
   * in as someone else can't have that account overwritten (ADR-0024).
   */
  registerRacer(input: RacerRegistrationInput): Racer {
    const racer = this.db.createRacer(input);
    const activeEvent = this.db.getActiveEvent();
    if (activeEvent) {
      this.db.ensureEventRegistration(activeEvent.id, racer.id);
    }
    return racer;
  }
}
