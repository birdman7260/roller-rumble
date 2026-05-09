import { describe, expect, it } from "vitest";
import {
  createSignedPhotoBoothToken,
  PHOTO_BOOTH_TOKEN_TTL_MS,
  verifySignedPhotoBoothToken,
  type PhotoBoothTokenPayload
} from "./photo-booth";

function createPayload(issuedAtMs: number): PhotoBoothTokenPayload {
  return {
    version: 1,
    purpose: "photo-booth-avatar",
    eventId: "event-1",
    eventName: "Main Event",
    racerId: "racer-1",
    racerName: "Ada Fast",
    racerAvatarUrl: null,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + PHOTO_BOOTH_TOKEN_TTL_MS).toISOString(),
    nonce: "nonce-1"
  };
}

describe("photo booth QR tokens", () => {
  it("round-trips a signed booth token", () => {
    const payload = createPayload(Date.now());
    const token = createSignedPhotoBoothToken(payload, "secret");

    expect(verifySignedPhotoBoothToken(token, "secret")).toEqual(payload);
  });

  it("rejects tokens signed with a different pairing secret", () => {
    const payload = createPayload(Date.now());
    const token = createSignedPhotoBoothToken(payload, "secret");

    expect(() => verifySignedPhotoBoothToken(token, "other-secret")).toThrow(/signature/i);
  });

  it("validates expiration against the supplied capture timestamp", () => {
    const issuedAtMs = Date.now();
    const payload = createPayload(issuedAtMs);
    const token = createSignedPhotoBoothToken(payload, "secret");

    expect(() =>
      verifySignedPhotoBoothToken(token, "secret", issuedAtMs + PHOTO_BOOTH_TOKEN_TTL_MS - 1_000)
    ).not.toThrow();
    expect(() =>
      verifySignedPhotoBoothToken(token, "secret", issuedAtMs + PHOTO_BOOTH_TOKEN_TTL_MS + 1_000)
    ).toThrow(/expired/i);
  });
});
