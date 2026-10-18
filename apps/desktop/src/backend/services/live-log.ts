/**
 * The app log's most recent lines, kept in memory so the admin `Live log` panel can show them as
 * they happen without re-reading the (up to 5 MB) log file on every poll. The Electron logger feeds
 * it every message after secret scrubbing (see `electron/logging.ts`), so it never holds anything
 * the log file wouldn't.
 */

import { format } from "node:util";
import type { LiveLogEntry } from "@roller-rumble/shared/types";

/** The slice of an electron-log message the live log reads. */
export interface LiveLogMessage {
  date: Date;
  level: string;
  data: unknown[];
}

/** Enough for about a minute of raw sensor logging, without holding the whole file in memory. */
const DEFAULT_CAPACITY = 1000;

export class LiveLog {
  private lines: LiveLogEntry[] = [];
  // Ids keep rising across a clear, so a viewer can always tell a new line from one it has seen.
  private nextId = 1;

  constructor(private readonly capacity = DEFAULT_CAPACITY) {}

  push(message: LiveLogMessage): void {
    this.lines.push({
      id: this.nextId,
      at: message.date.toISOString(),
      level: message.level,
      text: format(...message.data)
    });
    this.nextId += 1;
    if (this.lines.length > this.capacity) {
      this.lines = this.lines.slice(-this.capacity);
    }
  }

  entries(): LiveLogEntry[] {
    return [...this.lines];
  }

  clear(): void {
    this.lines = [];
  }
}
