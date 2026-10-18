import fs from "node:fs";
import log from "electron-log/main";
import { SECRET_ENV_KEYS } from "@roller-rumble/shared/managed-settings";
import type { LiveLogEntry } from "@roller-rumble/shared/types";
import { LiveLog, type LiveLogMessage } from "../backend/services/live-log";

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_LOG_TAIL_LINES = 800;

// The newest lines in memory, for the admin Live log panel (see `LiveLog`).
const liveLog = new LiveLog();

function collectSecretValues(): string[] {
  return SECRET_ENV_KEYS.map((key) => process.env[key]?.trim()).filter(
    (value): value is string => Boolean(value) && value!.length >= 4
  );
}

/**
 * Always-on logging via electron-log (see ADR 0004). Captures both main and renderer output to a
 * size-rotated file in the per-user data folder, and routes the app's existing `console.*` calls
 * through it. A scrubbing hook guarantees secret values are never written to the log in the first
 * place — belt-and-suspenders with the diagnostics-bundle redactor.
 */
export function initLogging(): void {
  log.initialize();
  log.transports.file.maxSize = MAX_LOG_FILE_BYTES;
  log.transports.file.level = "info";
  log.transports.console.level = "info";

  log.hooks.push((message) => {
    const secrets = collectSecretValues();
    if (secrets.length > 0 && Array.isArray(message.data)) {
      message.data = (message.data as unknown[]).map((part): unknown =>
        typeof part === "string"
          ? secrets.reduce((acc, secret) => acc.split(secret).join("[redacted]"), part)
          : part
      );
    }
    return message;
  });

  // A transport rather than a hook: hooks run once per transport, a transport runs once per message,
  // and it sees the message after the scrubbing hook above.
  log.transports.live = Object.assign((message: LiveLogMessage) => liveLog.push(message), {
    level: "info" as const,
    transforms: []
  });

  // Route existing console.* through electron-log so all current logging is captured to file.
  Object.assign(console, log.functions);
}

export function getLogFilePath(): string {
  return log.transports.file.getFile().path;
}

/** Recent log lines for the diagnostics bundle. Returns [] if the log file can't be read yet. */
export function getRecentLogLines(limit = DEFAULT_LOG_TAIL_LINES): string[] {
  try {
    const content = fs.readFileSync(getLogFilePath(), "utf8");
    return content
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .slice(-limit);
  } catch {
    return [];
  }
}

/** The newest log lines, oldest first, for the admin Live log panel. */
export function getLiveLogEntries(): LiveLogEntry[] {
  return liveLog.entries();
}

/** Empty the log: both the live view and the log file the diagnostics bundle reads. */
export function clearLog(): void {
  log.transports.file.getFile().clear();
  liveLog.clear();
  console.info("[log] cleared from the admin Live log panel.");
}
