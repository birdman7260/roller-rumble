import type { PhotoBoothSession } from "../../../src/shared/types";

export const FAKE_QR_PREFIX = "fake";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function parseFakeJsonToken(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (record.type !== "goldsprints.photo-booth.fake-token") {
      return null;
    }

    const name = record.racerName ?? record.displayName ?? record.name;
    return typeof name === "string" && name.trim() ? name.trim() : "Fake Racer";
  } catch {
    return null;
  }
}

export function createFakePhotoBoothSession(
  token: string,
  nowMs = Date.now()
): PhotoBoothSession | null {
  const trimmed = token.trim();
  const jsonName = parseFakeJsonToken(trimmed);
  const lower = trimmed.toLowerCase();
  const isPlainFakeToken = lower === FAKE_QR_PREFIX || lower.startsWith(`${FAKE_QR_PREFIX}:`);
  if (!jsonName && !isPlainFakeToken) {
    return null;
  }

  const racerName = (jsonName ?? trimmed.slice(FAKE_QR_PREFIX.length + 1).trim()) || "Fake Racer";
  const slug = slugify(racerName) || "fake-racer";
  return {
    eventId: "fake-event",
    eventName: "Fake Photo Booth Test",
    racerId: `fake-${slug}`,
    racerName,
    racerAvatarUrl: null,
    expiresAt: new Date(nowMs + 60 * 60 * 1000).toISOString()
  };
}

export function isFakeQrToken(token: string): boolean {
  return createFakePhotoBoothSession(token) !== null;
}
