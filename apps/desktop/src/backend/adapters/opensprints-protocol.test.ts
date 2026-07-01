import { describe, expect, it } from "vitest";
import {
  buildArmCommands,
  buildStopCommands,
  createLineDecoder,
  createOpenSprintsDecoder,
  parseOpenSprintsLine,
  type OpenSprintsMessage
} from "./opensprints-protocol";

describe("parseOpenSprintsLine", () => {
  it("reads the version reply to a `v` query", () => {
    expect(parseOpenSprintsLine("V:SS_v0.1.7")).toEqual({
      type: "version",
      firmware: "SS_v0.1.7"
    });
  });

  it("reads countdown steps, treating 0 as GO", () => {
    expect(parseOpenSprintsLine("CD:3")).toEqual({ type: "countdown", value: 3 });
    expect(parseOpenSprintsLine("CD:0")).toEqual({ type: "countdown", value: 0 });
  });

  it("reads a race progress frame into four ticks plus elapsed millis", () => {
    expect(parseOpenSprintsLine("R:120,131,0,0,5000")).toEqual({
      type: "progress",
      ticks: [120, 131, 0, 0],
      elapsedMs: 5000
    });
  });

  it("is robust to stray empty columns in a progress frame", () => {
    // Defensive: a doubled comma must not shift the elapsed-millis column.
    expect(parseOpenSprintsLine("R:7,8,9,10,,2500")).toEqual({
      type: "progress",
      ticks: [7, 8, 9, 10],
      elapsedMs: 2500
    });
  });

  it("reads a per-racer finish line", () => {
    expect(parseOpenSprintsLine("0F:8423")).toEqual({
      type: "finish",
      sensorIndex: 0,
      finishMs: 8423
    });
    expect(parseOpenSprintsLine("3F:9001")).toEqual({
      type: "finish",
      sensorIndex: 3,
      finishMs: 9001
    });
  });

  it("reads false-start, length-ack, and mock-mode messages", () => {
    expect(parseOpenSprintsLine("FS:1")).toEqual({ type: "falseStart", sensorIndex: 1 });
    expect(parseOpenSprintsLine("L:200")).toEqual({ type: "lengthAck", ticks: 200 });
    expect(parseOpenSprintsLine("M:ON")).toEqual({ type: "mockMode", enabled: true });
    expect(parseOpenSprintsLine("M:OFF")).toEqual({ type: "mockMode", enabled: false });
  });

  it("ignores blank lines, boot chatter, errors, and malformed payloads", () => {
    const ignored = [
      "",
      "   ",
      "Setup starting",
      "Setup Complete, Starting Interrupts",
      "ERROR:Command invalid q",
      "R:onlyonefield",
      "R:1,2,notanumber,4,5000",
      "CD:notanumber",
      "0F:later"
    ];
    for (const line of ignored) {
      expect(parseOpenSprintsLine(line)).toBeNull();
    }
  });
});

describe("createLineDecoder", () => {
  it("splits a stream on CRLF and strips the carriage return", () => {
    const decoder = createLineDecoder();
    expect(decoder.push("V:SS_v0.1.7\r\nCD:3\r\n")).toEqual(["V:SS_v0.1.7", "CD:3"]);
  });

  it("buffers partial lines across chunk boundaries", () => {
    const decoder = createLineDecoder();
    expect(decoder.push("R:120,131,")).toEqual([]);
    expect(decoder.push("0,0,5000\r\n")).toEqual(["R:120,131,0,0,5000"]);
  });

  it("emits multiple lines and keeps an unterminated remainder buffered", () => {
    const decoder = createLineDecoder();
    expect(decoder.push("CD:1\r\nCD:0\r\nR:1,2,3,4,10")).toEqual(["CD:1", "CD:0"]);
    expect(decoder.flush()).toEqual(["R:1,2,3,4,10"]);
  });

  it("decodes a full race transcript end to end", () => {
    const decoder = createLineDecoder();
    const transcript = [
      "V:SS_v0.1.7",
      "L:200",
      "CD:3",
      "CD:2",
      "CD:1",
      "CD:0",
      "R:0,0,0,0,0",
      "R:5,4,0,0,250",
      "R:200,150,0,0,8423",
      "0F:8423"
    ].join("\r\n");

    const messages = decoder
      .push(`${transcript}\r\n`)
      .map(parseOpenSprintsLine)
      .filter((message): message is OpenSprintsMessage => message !== null);

    expect(messages).toEqual([
      { type: "version", firmware: "SS_v0.1.7" },
      { type: "lengthAck", ticks: 200 },
      { type: "countdown", value: 3 },
      { type: "countdown", value: 2 },
      { type: "countdown", value: 1 },
      { type: "countdown", value: 0 },
      { type: "progress", ticks: [0, 0, 0, 0], elapsedMs: 0 },
      { type: "progress", ticks: [5, 4, 0, 0], elapsedMs: 250 },
      { type: "progress", ticks: [200, 150, 0, 0], elapsedMs: 8423 },
      { type: "finish", sensorIndex: 0, finishMs: 8423 }
    ]);
  });
});

describe("createOpenSprintsDecoder", () => {
  it("decodes Variant A (ss-basic) line messages and reports the variant", () => {
    const decoder = createOpenSprintsDecoder();
    const messages = decoder.push("V:SS_v0.1.7\r\nCD:0\r\nR:5,4,0,0,250\r\n");
    expect(decoder.getVariant()).toBe("ss-basic");
    expect(messages).toEqual([
      { type: "version", firmware: "SS_v0.1.7" },
      { type: "countdown", value: 0 },
      { type: "progress", ticks: [5, 4, 0, 0], elapsedMs: 250 }
    ]);
  });

  it("decodes Variant B (basic) version, multi-line progress, and finish", () => {
    const decoder = createOpenSprintsDecoder();
    const messages = decoder.push("basic-1\r\n0: 5\r\n1: 3\r\nt: 250\r\n0f: 999\r\n");
    expect(decoder.getVariant()).toBe("basic");
    expect(messages).toEqual([
      { type: "version", firmware: "basic-1" },
      { type: "progress", ticks: [5, 3], elapsedMs: 250 },
      { type: "finish", sensorIndex: 0, finishMs: 999 }
    ]);
  });

  it("decodes Variant C (advanced) bitmask packets into cumulative ticks", () => {
    const decoder = createOpenSprintsDecoder();
    // 'b'=racer0, 'c'=racer1, 'd'=both. Two packets accumulate across calls.
    const first = decoder.push("!10@bcd#");
    const second = decoder.push("!20@b#");
    expect(decoder.getVariant()).toBe("advanced");
    expect(first).toEqual([{ type: "progress", ticks: [2, 2, 0, 0], elapsedMs: 10 }]);
    expect(second).toEqual([{ type: "progress", ticks: [3, 2, 0, 0], elapsedMs: 20 }]);
  });

  it("resets the Variant C running totals when the elapsed clock restarts", () => {
    const decoder = createOpenSprintsDecoder();
    decoder.push("!90@bb#");
    const afterRestart = decoder.push("!5@c#");
    expect(afterRestart).toEqual([{ type: "progress", ticks: [0, 1, 0, 0], elapsedMs: 5 }]);
  });

  it("buffers a packet split across chunks", () => {
    const decoder = createOpenSprintsDecoder();
    expect(decoder.push("!10@b")).toEqual([]);
    expect(decoder.push("c#")).toEqual([{ type: "progress", ticks: [1, 1, 0, 0], elapsedMs: 10 }]);
  });
});

describe("OpenSprints command builders", () => {
  it("builds Variant A arm commands with a decimal length", () => {
    expect(buildArmCommands("ss-basic")).toEqual(["d\n", "l1000000\n", "g\n"]);
  });

  it("builds Variant B arm commands with a binary length", () => {
    // 0x7fff (max positive int16) little-endian: low 0xff, high 0x7f. Preceded by 'l' (0x6c),
    // terminated by CR (0x0d). Sending 0xffff would wrap to -1 in the firmware's signed int.
    expect(buildArmCommands("basic")).toEqual([Uint8Array.of(0x6c, 0xff, 0x7f, 0x0d), "g\n"]);
  });

  it("builds Variant C arm commands as just GO", () => {
    expect(buildArmCommands("advanced")).toEqual(["g\n"]);
  });

  it("falls back to Variant A commands when the variant is unknown", () => {
    expect(buildArmCommands("unknown")).toEqual(["d\n", "l1000000\n", "g\n"]);
  });

  it("stops with the same command for every variant", () => {
    expect(buildStopCommands()).toEqual(["s\n"]);
  });
});
