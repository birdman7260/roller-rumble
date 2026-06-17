import net from "node:net";
import { Bonjour, type Service } from "bonjour-service";
import { DEFAULT_OS2L_PORT } from "@roller-rumble/shared/constants";
import type { Os2lDiagnostics } from "@roller-rumble/shared/types";
import type { CountdownTriggerListener, RaceTriggerAdapter } from "./trigger";

const COUNTDOWN_ATTRIBUTE_NAMES = [
  "countdownMs",
  "countdownDurationMs",
  "countdownMilliseconds",
  "countdown_ms",
  "countdown_duration_ms",
  "countdown_milliseconds"
] as const;

const START_CUE_MARKERS = ["roller-rumble-start", "race-start"] as const;
const OS2L_SERVICE_NAME = "Roller Rumble";

type DiagnosticsListener = (diagnostics: Os2lDiagnostics) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeMessage(message: string): string {
  return message.trim().slice(0, 1_000);
}

function valueContainsStartCue(value: unknown): boolean {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return START_CUE_MARKERS.some((marker) => normalized.includes(marker));
  }

  if (Array.isArray(value)) {
    return value.some((child) => valueContainsStartCue(child));
  }

  if (value && typeof value === "object") {
    return Object.values(value).some((child) => valueContainsStartCue(child));
  }

  return false;
}

function unknownToSearchText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function valueIsOffState(value: unknown): boolean {
  const normalized = unknownToSearchText(value).toLowerCase();
  return normalized === "off" || normalized === "false" || normalized === "release";
}

function objectContainsStartCueCommand(value: unknown): boolean {
  if (typeof value === "string") {
    return valueContainsStartCue(value);
  }

  if (Array.isArray(value)) {
    return value.some((child) => objectContainsStartCueCommand(child));
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const hasStartCueMarker =
    valueContainsStartCue(record.name) ||
    valueContainsStartCue(record.id) ||
    valueContainsStartCue(record.button) ||
    valueContainsStartCue(record.command);
  if (hasStartCueMarker && !valueIsOffState(record.state)) {
    return true;
  }

  if (hasStartCueMarker) {
    return false;
  }

  return Object.entries(record).some(([key, child]) => {
    if (["name", "id", "button", "command", "state"].includes(key)) {
      return false;
    }
    return objectContainsStartCueCommand(child);
  });
}

function objectLooksLikeStartCue(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const eventName = unknownToSearchText(record.evt ?? record.event ?? record.type).toLowerCase();
  const action = unknownToSearchText(record.action ?? record.command ?? record.cmd).toLowerCase();

  if ((eventName === "cue" || eventName === "play") && (action === "" || action === "start")) {
    return true;
  }

  if (action === "start") {
    return true;
  }

  return Object.values(record).some((child) => objectLooksLikeStartCue(child));
}

export function isOs2lStartCueMessage(message: string): boolean {
  const trimmed = message.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return objectContainsStartCueCommand(parsed) || objectLooksLikeStartCue(parsed);
  } catch {
    // VirtualDJ OS2L actions are often plain commands instead of JSON.
  }

  const normalized = message.toLowerCase();
  return (
    START_CUE_MARKERS.some((marker) => normalized.includes(marker)) ||
    normalized.includes('"evt":"play"') ||
    normalized.includes('"evt":"cue"') ||
    normalized.includes('"action":"start"')
  );
}

function isOs2lBeatMessage(message: string): boolean {
  try {
    const parsed: unknown = JSON.parse(message.trim());
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      unknownToSearchText((parsed as Record<string, unknown>).evt).toLowerCase() === "beat"
    );
  } catch {
    return false;
  }
}

function readCountdownDurationFromObject(value: unknown): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const name of COUNTDOWN_ATTRIBUTE_NAMES) {
    const durationMs = normalizeCountdownDuration(record[name]);
    if (durationMs != null) {
      return durationMs;
    }
  }

  for (const child of Object.values(record)) {
    const durationMs = readCountdownDurationFromObject(child);
    if (durationMs != null) {
      return durationMs;
    }
  }

  return null;
}

function normalizeCountdownDuration(value: unknown): number | null {
  const durationMs =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  return Math.round(durationMs);
}

export function parseOs2lCountdownDurationMs(message: string): number | null {
  const trimmed = message.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const durationMs = readCountdownDurationFromObject(parsed);
    if (durationMs != null) {
      return durationMs;
    }
  } catch {
    // VirtualDJ OS2L actions are often plain commands instead of JSON.
  }

  for (const name of COUNTDOWN_ATTRIBUTE_NAMES) {
    const attributePattern = new RegExp(`${name}\\s*[:=]\\s*"?([0-9]+(?:\\.[0-9]+)?)"?`, "i");
    const match = attributePattern.exec(message);
    if (match?.[1]) {
      const durationMs = normalizeCountdownDuration(match[1]);
      if (durationMs != null) {
        return durationMs;
      }
    }
  }

  return null;
}

export class Os2lRaceTriggerAdapter implements RaceTriggerAdapter {
  readonly id = "os2l";
  readonly label = "VirtualDJ OS2L";

  private server: net.Server | null = null;
  private bonjour: Bonjour | null = null;
  private publishedService: Service | null = null;
  private listener: CountdownTriggerListener | null = null;
  private diagnosticsListener: DiagnosticsListener | null = null;
  private enabled = false;
  private armedRaceId: string | null = null;
  private diagnostics: Os2lDiagnostics;

  constructor(private readonly port = DEFAULT_OS2L_PORT) {
    this.diagnostics = {
      enabled: false,
      listening: false,
      advertising: false,
      port,
      serviceName: OS2L_SERVICE_NAME,
      armedRaceId: null,
      acceptedMessageCount: 0,
      ignoredMessageCount: 0,
      beatMessageCount: 0,
      lastBeatAt: null,
      lastRawMessage: null,
      lastRawMessageAt: null,
      lastAcceptedMessage: null,
      lastAcceptedAt: null,
      lastIgnoredMessage: null,
      lastIgnoredAt: null,
      lastIgnoredReason: null,
      lastError: null
    };
  }

  start(listener: CountdownTriggerListener): void {
    this.listener = listener;
    this.server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        const message = chunk.toString();
        if (isOs2lBeatMessage(message)) {
          this.recordBeatMessage();
          return;
        }

        this.recordRawMessage(message);

        if (!this.enabled || !this.armedRaceId) {
          this.recordIgnoredMessage(
            message,
            !this.enabled ? "VirtualDJ cue start is disabled." : "No race is currently armed."
          );
          return;
        }

        if (isOs2lStartCueMessage(message)) {
          this.recordAcceptedMessage(message);
          this.listener?.("os2l", {
            countdownDurationMs: parseOs2lCountdownDurationMs(message) ?? undefined
          });
          return;
        }

        this.recordIgnoredMessage(message, "Message did not contain roller-rumble-start.");
      });
    });

    this.server.on("error", (error) => {
      this.updateDiagnostics({ listening: false, lastError: error.message });
    });

    this.server.listen(this.port, () => {
      this.updateDiagnostics({ listening: true, lastError: null });
      this.startAdvertising();
    });
  }

  stop(): void {
    this.disarmRace();
    this.listener = null;
    this.stopAdvertising();
    this.server?.close();
    this.server = null;
    this.updateDiagnostics({ listening: false });
  }

  armRace(raceId: string): void {
    this.armedRaceId = raceId;
    this.updateDiagnostics({ armedRaceId: raceId });
  }

  disarmRace(): void {
    this.armedRaceId = null;
    this.updateDiagnostics({ armedRaceId: null });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.updateDiagnostics({ enabled });
  }

  getDiagnostics(): Os2lDiagnostics {
    return { ...this.diagnostics };
  }

  onDiagnosticsChange(listener: DiagnosticsListener): void {
    this.diagnosticsListener = listener;
  }

  private startAdvertising(): void {
    try {
      this.stopAdvertising();
      this.bonjour = new Bonjour(undefined, (error: Error) => {
        this.updateDiagnostics({ advertising: false, lastError: error.message });
      });
      this.publishedService = this.bonjour.publish({
        name: OS2L_SERVICE_NAME,
        type: "os2l",
        protocol: "tcp",
        port: this.port,
        txt: {
          app: "roller-rumble"
        }
      });
      this.updateDiagnostics({ advertising: true, lastError: null });
    } catch (error) {
      this.updateDiagnostics({
        advertising: false,
        lastError: error instanceof Error ? error.message : "Failed to advertise OS2L service."
      });
    }
  }

  private stopAdvertising(): void {
    this.publishedService?.stop();
    this.publishedService = null;
    this.bonjour?.destroy();
    this.bonjour = null;
    this.updateDiagnostics({ advertising: false });
  }

  private recordRawMessage(message: string): void {
    this.updateDiagnostics({
      lastRawMessage: normalizeMessage(message),
      lastRawMessageAt: nowIso()
    });
  }

  private recordAcceptedMessage(message: string): void {
    this.updateDiagnostics({
      acceptedMessageCount: this.diagnostics.acceptedMessageCount + 1,
      lastAcceptedMessage: normalizeMessage(message),
      lastAcceptedAt: nowIso(),
      lastIgnoredReason: null
    });
  }

  private recordBeatMessage(): void {
    this.updateDiagnostics({
      beatMessageCount: this.diagnostics.beatMessageCount + 1,
      lastBeatAt: nowIso()
    });
  }

  private recordIgnoredMessage(message: string, reason: string): void {
    this.updateDiagnostics({
      ignoredMessageCount: this.diagnostics.ignoredMessageCount + 1,
      lastIgnoredMessage: normalizeMessage(message),
      lastIgnoredAt: nowIso(),
      lastIgnoredReason: reason
    });
  }

  private updateDiagnostics(patch: Partial<Os2lDiagnostics>): void {
    this.diagnostics = {
      ...this.diagnostics,
      ...patch
    };
    this.diagnosticsListener?.(this.getDiagnostics());
  }
}
