/**
 * Parser for the OpenSprints / SilverSprint serial protocol. The hardware is an
 * Arduino behind a USB-to-serial chip presenting a COM port at 115200 8N1.
 *
 * Three firmware variants exist (see docs/opensprints-protocol.md):
 *   - `ss-basic` (Variant A, newest) — line-oriented `KEY:value`, `R:` progress.
 *   - `basic`    (Variant B, original) — line-oriented but progress is one line per
 *     racer (`0: <ticks>`) closed by a `t: <millis>` line; version reply `basic-1`.
 *   - `advanced` (Variant C, oldest) — binary-ish `!<ms>@<frames>#` packets where each
 *     frame char is a 4-bit per-racer tick bitmask offset by `'a'`.
 *
 * {@link parseOpenSprintsLine} covers the single-line Variant A messages.
 * {@link createOpenSprintsDecoder} is the stateful, multi-variant decoder the transport
 * uses: it owns framing (lines *and* packets) and the multi-line/packet accumulation the
 * other variants need, and normalizes everything to {@link OpenSprintsMessage}. One `tick`
 * = one roller revolution; progress messages carry a cumulative tick count per sensor (0-3).
 */

/** Which firmware dialect a connected box speaks. `unknown` until detected. */
export type OpenSprintsVariant = "ss-basic" | "basic" | "advanced" | "unknown";

/** A byte sequence to write to the box: ASCII commands as strings, binary as bytes. */
export type SerialCommand = string | Uint8Array;

export type OpenSprintsMessage =
  /** `V:<firmware>` — version reply to a `v` query; proves device identity. */
  | { type: "version"; firmware: string }
  /** `CD:<n>` — countdown step, emitted once per second after `g`. 0 means GO. */
  | { type: "countdown"; value: number }
  /** `R:<t0>,<t1>,<t2>,<t3>,<ms>` — cumulative ticks per sensor + elapsed millis. */
  | { type: "progress"; ticks: number[]; elapsedMs: number }
  /** `<i>F:<ms>` — sensor `i` reached the box's tick length at `<ms>`. */
  | { type: "finish"; sensorIndex: number; finishMs: number }
  /** `FS:<i>` — false start reported for sensor `i` (cosmetic in dumb-sensor mode). */
  | { type: "falseStart"; sensorIndex: number }
  /** `L:<n>` — acknowledgement that race length was set to `<n>` ticks. */
  | { type: "lengthAck"; ticks: number }
  /** `M:ON` / `M:OFF` — mock-mode toggle confirmation. */
  | { type: "mockMode"; enabled: boolean };

/**
 * Parse a single, already line-split message. Returns `null` for blank lines,
 * unrecognized keys, firmware boot chatter, and `ERROR:`/malformed payloads —
 * callers treat `null` as "ignore", never as a fault.
 */
export function parseOpenSprintsLine(line: string): OpenSprintsMessage | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const separator = trimmed.indexOf(":");
  if (separator === -1) {
    return null;
  }

  const key = trimmed.slice(0, separator);
  const value = trimmed.slice(separator + 1).trim();

  switch (key) {
    case "V":
      return value.length > 0 ? { type: "version", firmware: value } : null;
    case "CD": {
      const parsed = parseInteger(value);
      return parsed === null ? null : { type: "countdown", value: parsed };
    }
    case "R":
      return parseProgress(value);
    case "FS": {
      const parsed = parseInteger(value);
      return parsed === null ? null : { type: "falseStart", sensorIndex: parsed };
    }
    case "L": {
      const parsed = parseInteger(value);
      return parsed === null ? null : { type: "lengthAck", ticks: parsed };
    }
    case "M":
      return { type: "mockMode", enabled: value.toUpperCase() === "ON" };
    default:
      return parseFinish(key, value);
  }
}

function parseProgress(value: string): OpenSprintsMessage | null {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  // Need at least one tick column plus the trailing elapsed-millis column.
  if (parts.length < 2) {
    return null;
  }

  const numbers: number[] = [];
  for (const part of parts) {
    const parsed = parseInteger(part);
    if (parsed === null) {
      return null;
    }
    numbers.push(parsed);
  }

  const elapsedMs = numbers[numbers.length - 1];
  const ticks = numbers.slice(0, -1);
  return { type: "progress", ticks, elapsedMs };
}

function parseFinish(key: string, value: string): OpenSprintsMessage | null {
  // Finish lines are keyed `<digit>F`, e.g. `0F:1234`.
  const match = /^([0-9])F$/.exec(key);
  if (!match) {
    return null;
  }

  const finishMs = parseInteger(value);
  if (finishMs === null) {
    return null;
  }

  return { type: "finish", sensorIndex: Number(match[1]), finishMs };
}

function parseInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Stateful decoder that turns arbitrary serial chunks into whole lines. Serial
 * reads split mid-line, so bytes are buffered until a `\n` arrives; a trailing
 * `\r` (the `\r\n` terminator) is stripped. `flush` yields any unterminated
 * remainder, e.g. on disconnect.
 */
export function createLineDecoder(): {
  push(chunk: string): string[];
  flush(): string[];
} {
  let buffer = "";

  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines: string[] = [];

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        let line = buffer.slice(0, newlineIndex);
        if (line.endsWith("\r")) {
          line = line.slice(0, -1);
        }
        lines.push(line);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }

      return lines;
    },
    flush(): string[] {
      const remainder = buffer;
      buffer = "";
      return remainder.length > 0 ? [remainder] : [];
    }
  };
}

/** ASCII command (with terminator) that asks the box to identify its firmware. */
export const OPENSPRINTS_VERSION_QUERY = "v\n";

/** Variant A finish line so far away the box never declares its own winner. */
const SS_BASIC_NEVER_FINISH_TICKS = 1_000_000;
/** Variant B race length is a 2-byte value; max it out so the box never finishes. */
const BASIC_NEVER_FINISH_TICKS = 0xffff;

/**
 * The commands, in order, that put a box into a streaming race the app controls — a
 * finish line set effectively unreachable, then GO. Encoding differs per variant: A takes
 * a decimal length, B takes `l` + two little-endian bytes + `\r`, C has no length at all.
 */
export function buildArmCommands(variant: OpenSprintsVariant): SerialCommand[] {
  switch (variant) {
    case "basic":
      return [
        Uint8Array.of(
          0x6c, // 'l'
          BASIC_NEVER_FINISH_TICKS & 0xff,
          (BASIC_NEVER_FINISH_TICKS >> 8) & 0xff,
          0x0d // '\r'
        ),
        "g\n"
      ];
    case "advanced":
      return ["g\n"];
    case "ss-basic":
    case "unknown":
      return ["d\n", `l${SS_BASIC_NEVER_FINISH_TICKS}\n`, "g\n"];
  }
}

/** The command(s) that stop the box streaming. Identical across variants. */
export function buildStopCommands(): SerialCommand[] {
  return ["s\n"];
}

/** Whole lines (`\n`, `\r`, or `\r\n` terminated) or binary `!…#` packets the box can send. */
interface OpenSprintsDecoder {
  /** Feed raw serial bytes; returns any complete, normalized messages decoded so far. */
  push(chunk: string): OpenSprintsMessage[];
  /** Best-known firmware variant from a version reply or stream framing seen so far. */
  getVariant(): OpenSprintsVariant;
}

/**
 * Build the stateful, multi-variant decoder. It frames the byte stream itself — CR/LF lines
 * and `!…#` packets can't collide, so it auto-detects A/B/C without being told which — and
 * accumulates the multi-line (B) and per-frame (C) progress into the same cumulative-tick
 * {@link OpenSprintsMessage} the session already understands.
 */
export function createOpenSprintsDecoder(): OpenSprintsDecoder {
  let buffer = "";
  let variant: OpenSprintsVariant = "unknown";
  // Variant B prints one cumulative line per racer then a `t:` line; hold the latest per-racer
  // counts until the `t:` flushes them as one progress message.
  const basicTicks: number[] = [];
  // Variant C streams per-2ms tick bitmasks; accumulate into cumulative counts per racer.
  let advancedTicks: number[] = [];
  let advancedLastElapsedMs = 0;

  function firstLineBreak(text: string): number {
    const lf = text.indexOf("\n");
    const cr = text.indexOf("\r");
    if (lf === -1) {
      return cr;
    }
    if (cr === -1) {
      return lf;
    }
    return Math.min(lf, cr);
  }

  function decodePacket(packet: string): OpenSprintsMessage | null {
    const atIndex = packet.indexOf("@");
    if (atIndex === -1) {
      return null;
    }
    const elapsedMs = parseInteger(packet.slice(1, atIndex));
    if (elapsedMs === null) {
      return null;
    }
    // A drop in the elapsed clock means the box restarted the race; zero the running totals.
    if (elapsedMs < advancedLastElapsedMs) {
      advancedTicks = [];
    }
    advancedLastElapsedMs = elapsedMs;

    const frames = packet.slice(atIndex + 1, -1);
    for (const frame of frames) {
      const mask = frame.charCodeAt(0) - 97; // offset by 'a'
      if (mask < 0 || mask > 0xf) {
        continue;
      }
      for (let racer = 0; racer < 4; racer += 1) {
        if ((mask & (1 << racer)) !== 0) {
          advancedTicks[racer] = (advancedTicks[racer] ?? 0) + 1;
        }
      }
    }

    variant = "advanced";
    const ticks: number[] = [];
    for (let racer = 0; racer < 4; racer += 1) {
      ticks.push(advancedTicks[racer] ?? 0);
    }
    return { type: "progress", ticks, elapsedMs };
  }

  function decodeLine(rawLine: string): OpenSprintsMessage | null {
    const line = rawLine.trim();
    if (line.length === 0) {
      return null;
    }

    // Variant B: a per-racer cumulative tick line, held until the `t:` flush.
    const tick = /^([0-3]):\s*(\d+)$/.exec(line);
    if (tick) {
      variant = "basic";
      basicTicks[Number(tick[1])] = Number(tick[2]);
      return null;
    }

    // Variant B: the `t:` line closes a progress cycle with the elapsed millis.
    const total = /^t:\s*(\d+)$/.exec(line);
    if (total) {
      variant = "basic";
      const ticks = basicTicks.map((value) => value || 0);
      return { type: "progress", ticks, elapsedMs: Number(total[1]) };
    }

    // Variant B: lowercase finish, `0f: <millis>`.
    const finish = /^([0-3])f:\s*(\d+)$/.exec(line);
    if (finish) {
      variant = "basic";
      return { type: "finish", sensorIndex: Number(finish[1]), finishMs: Number(finish[2]) };
    }

    // Variant B: version reply is the bare string `basic-1`.
    if (/^basic/i.test(line)) {
      variant = "basic";
      return { type: "version", firmware: line };
    }

    // Otherwise it is a Variant A line.
    const message = parseOpenSprintsLine(line);
    if (message && (message.type === "version" || message.type === "countdown")) {
      variant = "ss-basic";
    } else if (message?.type === "progress") {
      variant = "ss-basic";
    }
    return message;
  }

  return {
    push(chunk: string): OpenSprintsMessage[] {
      buffer += chunk;
      const messages: OpenSprintsMessage[] = [];

      while (buffer.length > 0) {
        const bang = buffer.indexOf("!");
        const lineBreak = firstLineBreak(buffer);

        // A `!…#` packet (Variant C) comes before the next line break: decode it whole.
        if (bang !== -1 && (lineBreak === -1 || bang < lineBreak)) {
          const hash = buffer.indexOf("#", bang + 1);
          if (hash === -1) {
            // Incomplete packet; drop any leading junk and wait for the rest.
            buffer = buffer.slice(bang);
            break;
          }
          const packet = buffer.slice(bang, hash + 1);
          buffer = buffer.slice(hash + 1);
          const message = decodePacket(packet);
          if (message) {
            messages.push(message);
          }
          continue;
        }

        if (lineBreak === -1) {
          break;
        }

        // A lone trailing `\r` may be the first half of a `\r\n`; wait for the next chunk.
        if (buffer[lineBreak] === "\r" && lineBreak === buffer.length - 1) {
          break;
        }

        const line = buffer.slice(0, lineBreak);
        const skip = buffer[lineBreak] === "\r" && buffer[lineBreak + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(lineBreak + skip);
        const message = decodeLine(line);
        if (message) {
          messages.push(message);
        }
      }

      return messages;
    },
    getVariant(): OpenSprintsVariant {
      return variant;
    }
  };
}
