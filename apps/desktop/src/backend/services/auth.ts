import crypto from "node:crypto";
import { nanoid } from "nanoid";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  WebAuthnCredential
} from "@simplewebauthn/server";
import type {
  PasskeyRegistrationStartInput,
  PasskeyRegistrationStartResponse,
  PasskeySignInStartResponse,
  Racer
} from "@roller-rumble/shared/types";
import type { AppDatabase, StoredPasskeyCredential } from "../db/Database";
import { AppHttpError } from "./http-error";

const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RACER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RACER_SESSION_SECRET_SETTING_KEY = "racerSessionSecret";

/**
 * Narrow database port for racer passkey/session auth. Expressed as a
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
  | "findRacerByIdentity"
  | "listPasskeyCredentialsForRacer"
  | "getPasskeyCredentialByCredentialId"
  | "updatePasskeyCredentialUse"
  | "updateRacerRegistration"
  | "createOrUpdateRacer"
  | "createPasskeyCredential"
>;

export interface PasskeyRequestContext {
  origin: string;
  rpId: string;
}

interface PasskeyChallenge {
  id: string;
  kind: "sign-in" | "registration";
  challenge: string;
  email: string;
  origin: string;
  rpId: string;
  expiresAt: number;
  racerId?: string;
  displayName?: string;
  phone?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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

function toWebAuthnCredential(credential: StoredPasskeyCredential): WebAuthnCredential {
  return {
    id: credential.credentialId,
    publicKey: Buffer.from(credential.publicKey, "base64url"),
    counter: credential.counter,
    transports: credential.transports as AuthenticatorTransportFuture[]
  };
}

/**
 * Leaf module owning racer passkey enrollment, passkey sign-in, and signed
 * session tokens. It never emits snapshots and never knows the `AppSnapshot`
 * shape: the `finish*` methods return the resolved `Racer`, and the caller
 * (`RollerRumbleApp`) decides when to broadcast.
 */
export class AuthService {
  private readonly passkeyChallenges = new Map<string, PasskeyChallenge>();

  constructor(private readonly db: AuthStore) {}

  getPasskeyRequestContext(origin: string): PasskeyRequestContext {
    const parsedOrigin = new URL(origin);
    const configuredRpId = process.env.ROLLER_RUMBLE_PASSKEY_RP_ID?.trim();
    return {
      origin: parsedOrigin.origin,
      rpId:
        configuredRpId !== undefined && configuredRpId.length > 0
          ? configuredRpId
          : parsedOrigin.hostname
    };
  }

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

  createRacerSessionToken(racerId: string): string {
    const payload = encodeBase64UrlJson({
      racerId,
      expiresAt: Date.now() + RACER_SESSION_TTL_MS
    });
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
        expiresAt?: number;
      };
      if (!decoded.racerId || !decoded.expiresAt || decoded.expiresAt < Date.now()) {
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

  private rememberPasskeyChallenge(challenge: Omit<PasskeyChallenge, "id" | "expiresAt">): string {
    const id = nanoid();
    this.passkeyChallenges.set(id, {
      ...challenge,
      id,
      expiresAt: Date.now() + PASSKEY_CHALLENGE_TTL_MS
    });
    return id;
  }

  private consumePasskeyChallenge(id: string, kind: PasskeyChallenge["kind"]): PasskeyChallenge {
    const challenge = this.passkeyChallenges.get(id);
    this.passkeyChallenges.delete(id);
    if (challenge?.kind !== kind || challenge.expiresAt < Date.now()) {
      throw new AppHttpError("Passkey challenge expired. Please try again.", 400, "expired");
    }
    return challenge;
  }

  async startPasskeySignIn(
    emailInput: string,
    context: PasskeyRequestContext
  ): Promise<PasskeySignInStartResponse> {
    const email = normalizeEmail(emailInput);
    const racer = this.db.findRacerByIdentity("email", email);
    if (!racer) {
      return {
        status: "register_required",
        email
      };
    }

    const credentials = this.db.listPasskeyCredentialsForRacer(racer.id);
    if (credentials.length === 0) {
      return {
        status: "host_assist",
        email,
        message: "That email is already registered. Please ask the host to help attach a passkey."
      };
    }

    const options = await generateAuthenticationOptions({
      rpID: context.rpId,
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as AuthenticatorTransportFuture[]
      })),
      userVerification: "preferred"
    });
    const challengeId = this.rememberPasskeyChallenge({
      kind: "sign-in",
      challenge: options.challenge,
      email,
      racerId: racer.id,
      origin: context.origin,
      rpId: context.rpId
    });

    return {
      status: "passkey",
      email,
      challengeId,
      options
    };
  }

  async finishPasskeySignIn(challengeId: string, response: unknown): Promise<Racer> {
    const challenge = this.consumePasskeyChallenge(challengeId, "sign-in");
    const credentialId =
      typeof (response as { id?: unknown }).id === "string" ? (response as { id: string }).id : "";
    const credential = this.db.getPasskeyCredentialByCredentialId(credentialId);
    if (!credential || credential.racerId !== challenge.racerId) {
      throw new AppHttpError("Passkey credential was not recognized.", 401, "invalid_passkey");
    }

    const verification = await verifyAuthenticationResponse({
      response: response as AuthenticationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      credential: toWebAuthnCredential(credential),
      requireUserVerification: false
    });
    if (!verification.verified) {
      throw new AppHttpError("Passkey sign-in was not verified.", 401, "invalid_passkey");
    }

    this.db.updatePasskeyCredentialUse(
      verification.authenticationInfo.credentialID,
      verification.authenticationInfo.newCounter
    );
    const racer = this.db.getRacer(credential.racerId);
    if (!racer) {
      throw new AppHttpError("Racer account was not found.", 404, "racer_not_found");
    }

    const activeEvent = this.db.getActiveEvent();
    if (activeEvent) {
      this.db.ensureEventRegistration(activeEvent.id, racer.id);
    }
    return racer;
  }

  async startPasskeyRegistration(
    input: PasskeyRegistrationStartInput,
    context: PasskeyRequestContext,
    sessionRacerId?: string | null
  ): Promise<PasskeyRegistrationStartResponse> {
    const email = normalizeEmail(input.email);
    const existingRacer = this.db.findRacerByIdentity("email", email);
    if (existingRacer && existingRacer.id !== sessionRacerId) {
      return {
        status: "host_assist",
        email,
        message: "That email is already registered. Please ask the host to help attach a passkey."
      };
    }

    const racerForCredential = sessionRacerId ? this.db.getRacer(sessionRacerId) : null;
    const excludeCredentials = racerForCredential
      ? this.db.listPasskeyCredentialsForRacer(racerForCredential.id).map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports as AuthenticatorTransportFuture[]
        }))
      : [];
    const options = await generateRegistrationOptions({
      rpName: "Roller Rumble",
      rpID: context.rpId,
      userName: email,
      userDisplayName: input.displayName,
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred"
      }
    });
    const challengeId = this.rememberPasskeyChallenge({
      kind: "registration",
      challenge: options.challenge,
      email,
      displayName: input.displayName,
      phone: input.phone,
      racerId: sessionRacerId ?? undefined,
      origin: context.origin,
      rpId: context.rpId
    });

    return {
      status: "passkey",
      email,
      challengeId,
      options
    };
  }

  async finishPasskeyRegistration(challengeId: string, response: unknown): Promise<Racer> {
    const challenge = this.consumePasskeyChallenge(challengeId, "registration");
    const verification = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      requireUserVerification: false
    });
    if (!verification.verified) {
      throw new AppHttpError("Passkey registration was not verified.", 401, "invalid_passkey");
    }

    const credential = verification.registrationInfo.credential;
    const existingCredential = this.db.getPasskeyCredentialByCredentialId(credential.id);
    if (existingCredential) {
      throw new AppHttpError("That passkey is already registered.", 409, "duplicate_passkey");
    }

    let racer = challenge.racerId ? this.db.getRacer(challenge.racerId) : null;
    if (racer) {
      this.db.updateRacerRegistration(racer.id, {
        displayName: challenge.displayName ?? racer.displayName,
        email: challenge.email,
        phone: challenge.phone
      });
      racer = this.db.getRacer(racer.id);
    } else {
      racer = this.db.createOrUpdateRacer({
        displayName: challenge.displayName ?? challenge.email,
        email: challenge.email,
        phone: challenge.phone
      });
    }

    if (!racer) {
      throw new AppHttpError("Could not create racer account.", 500, "registration_failed");
    }

    this.db.createPasskeyCredential({
      racerId: racer.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp
    });

    const activeEvent = this.db.getActiveEvent();
    if (activeEvent) {
      this.db.ensureEventRegistration(activeEvent.id, racer.id);
    }
    return racer;
  }
}
