import crypto from "node:crypto";

export const PHOTO_BOOTH_TOKEN_TTL_MS = 5 * 60 * 1000;

export interface PhotoBoothTokenPayload {
  version: 1;
  purpose: "photo-booth-avatar";
  eventId: string;
  eventName: string;
  racerId: string;
  racerName: string;
  racerAvatarUrl?: string | null;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodePart(part: string): unknown {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
}

function sign(unsignedPayload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(unsignedPayload).digest("base64url");
}

function isPhotoBoothTokenPayload(value: unknown): value is PhotoBoothTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    record.purpose === "photo-booth-avatar" &&
    typeof record.eventId === "string" &&
    typeof record.eventName === "string" &&
    typeof record.racerId === "string" &&
    typeof record.racerName === "string" &&
    typeof record.issuedAt === "string" &&
    typeof record.expiresAt === "string" &&
    typeof record.nonce === "string" &&
    (record.racerAvatarUrl == null || typeof record.racerAvatarUrl === "string")
  );
}

export function createSignedPhotoBoothToken(
  payload: PhotoBoothTokenPayload,
  secret: string
): string {
  const unsignedPayload = encodePart(payload);
  return `${unsignedPayload}.${sign(unsignedPayload, secret)}`;
}

export function verifySignedPhotoBoothToken(
  token: string,
  secret: string,
  atMs = Date.now()
): PhotoBoothTokenPayload {
  const [unsignedPayload, signature, ...extraParts] = token.split(".");
  if (!unsignedPayload || !signature || extraParts.length > 0) {
    throw new Error("Invalid photo booth token format.");
  }

  const expectedSignature = sign(unsignedPayload, secret);
  const expected = Buffer.from(expectedSignature, "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error("Invalid photo booth token signature.");
  }

  const payload = decodePart(unsignedPayload);
  if (!isPhotoBoothTokenPayload(payload)) {
    throw new Error("Invalid photo booth token payload.");
  }

  if (new Date(payload.expiresAt).getTime() < atMs) {
    throw new Error("Photo booth QR expired. Refresh the QR code on the racer page.");
  }

  return payload;
}
