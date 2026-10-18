import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENSPRINTS_ROLLER_ROLLOUT_METERS } from "@roller-rumble/shared/constants";
import type { RaceParticipant } from "@roller-rumble/shared/types";
import type { RotationEvent, SensorLifecycleEvent, SensorStatus } from "./sensor";
import type { SerialCommand } from "./opensprints-protocol";
import {
  OpenSprintsSensorAdapter,
  type SerialConnection,
  type SerialPortInfo,
  type SerialTransport
} from "./opensprints-sensor";

/** Every relayed rotation carries its port's meters per tick; unconfigured ports use the default. */
const ROLLOUT = OPENSPRINTS_ROLLER_ROLLOUT_METERS;

const PARTICIPANTS: RaceParticipant[] = [
  { racerId: "r-left", lane: "left" },
  { racerId: "r-right", lane: "right" }
];

/** A scripted serial port. `emit` pushes bytes from the "box"; `drop` simulates an unplug. */
class FakeConnection implements SerialConnection {
  readonly writes: SerialCommand[] = [];
  closed = false;
  private dataHandler: ((chunk: string) => void) | null = null;
  private closeHandler: ((error: Error | null) => void) | null = null;

  constructor(private readonly onWrite?: (data: SerialCommand, conn: FakeConnection) => void) {}

  write(data: SerialCommand): void {
    this.writes.push(data);
    this.onWrite?.(data, this);
  }

  close(): void {
    this.closed = true;
    this.closeHandler?.(null);
  }

  onData(handler: (chunk: string) => void): void {
    this.dataHandler = handler;
  }

  onClose(handler: (error: Error | null) => void): void {
    this.closeHandler = handler;
  }

  emit(chunk: string): void {
    this.dataHandler?.(chunk);
  }

  drop(error: Error | null): void {
    this.closeHandler?.(error);
  }
}

interface PortSpec {
  path: string;
  /** USB vendor ID; defaults to FTDI. `null` is a non-USB port (Bluetooth, debug console). */
  vendorId?: string | null;
  /** Firmware the port reports to a `v` probe, or null to never answer (a non-box device). */
  firmware: string | null;
  failOpen?: boolean;
  /**
   * Ignore this many `v` queries before answering, simulating the Arduino's DTR-reset bootloader
   * swallowing the first queries. The adapter must re-query for the probe to succeed.
   */
  ignoreQueries?: number;
  /** Answer the `v` query with no line terminator, as real basic_msg boxes do. */
  omitVersionTerminator?: boolean;
}

class FakeTransport implements SerialTransport {
  readonly opened: FakeConnection[] = [];
  readonly openedPaths: string[] = [];

  constructor(private readonly ports: PortSpec[]) {}

  list(): Promise<SerialPortInfo[]> {
    return Promise.resolve(
      this.ports.map((port) => ({
        path: port.path,
        vendorId: port.vendorId === undefined ? "0403" : (port.vendorId ?? undefined)
      }))
    );
  }

  open(path: string): Promise<SerialConnection> {
    this.openedPaths.push(path);
    const spec = this.ports.find((port) => port.path === path);
    if (!spec || spec.failOpen) {
      return Promise.reject(new Error(`cannot open ${path}`));
    }
    const { firmware } = spec;
    let queriesSeen = 0;
    const connection = new FakeConnection((data, conn) => {
      if (data === "v\n" && firmware !== null) {
        queriesSeen += 1;
        // Simulate the bootloader swallowing the first queries after the DTR reset.
        if (queriesSeen <= (spec.ignoreQueries ?? 0)) {
          return;
        }
        // Variant B answers a bare `basic-1`; Variant A answers `V:<ver>`.
        const terminator = spec.omitVersionTerminator ? "" : "\r\n";
        const reply = firmware.startsWith("basic")
          ? `${firmware}${terminator}`
          : `V:${firmware}${terminator}`;
        queueMicrotask(() => conn.emit(reply));
      }
    });
    this.opened.push(connection);
    return Promise.resolve(connection);
  }

  /** The single still-open connection (rejected probes are closed). */
  liveConnection(): FakeConnection {
    const live = this.opened.find((connection) => !connection.closed);
    if (!live) {
      throw new Error("no live connection");
    }
    return live;
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

interface Harness {
  adapter: OpenSprintsSensorAdapter;
  transport: FakeTransport;
  rotations: RotationEvent[];
  lifecycle: SensorLifecycleEvent[];
  statuses: SensorStatus[];
}

interface TimingOverrides {
  probeTimeoutMs?: number;
  probeQueryIntervalMs?: number;
  reconnectIntervalMs?: number;
}

function makeAdapter(
  ports: PortSpec[],
  env: NodeJS.ProcessEnv = {},
  timing: TimingOverrides = {}
): Harness {
  const transport = new FakeTransport(ports);
  const rotations: RotationEvent[] = [];
  const lifecycle: SensorLifecycleEvent[] = [];
  const statuses: SensorStatus[] = [];
  const adapter = new OpenSprintsSensorAdapter({
    createTransport: () => Promise.resolve(transport),
    env,
    now: () => 10_000,
    probeTimeoutMs: timing.probeTimeoutMs ?? 20,
    probeQueryIntervalMs: timing.probeQueryIntervalMs ?? 5,
    reconnectIntervalMs: timing.reconnectIntervalMs ?? 30
  });
  adapter.onLifecycle((event) => lifecycle.push(event));
  adapter.onStatusChange((status) => statuses.push(status));
  adapter.connect((event) => rotations.push(event));
  return { adapter, transport, rotations, lifecycle, statuses };
}

describe("OpenSprintsSensorAdapter", () => {
  let active: OpenSprintsSensorAdapter | null = null;

  afterEach(() => {
    active?.disconnect();
    active = null;
  });

  it("probes ports and binds only the one that answers the version handshake", async () => {
    const harness = makeAdapter([
      { path: "/dev/ttyOther", vendorId: "ffff", firmware: null },
      { path: "/dev/ttyBox", vendorId: "2341", firmware: "SS_v0.1.7" }
    ]);
    active = harness.adapter;

    await waitFor(() => harness.adapter.getStatus().connected);

    const status = harness.adapter.getStatus();
    expect(status.portPath).toBe("/dev/ttyBox");
    expect(status.firmware).toBe("SS_v0.1.7");
  });

  it("re-queries so a box that resets on open (DTR) is still detected after it boots", async () => {
    // The bootloader swallows the first query; only a re-query lands once the sketch is up.
    const harness = makeAdapter([
      { path: "COM3", vendorId: "0403", firmware: "basic-1", ignoreQueries: 1 }
    ]);
    active = harness.adapter;

    await waitFor(() => harness.adapter.getStatus().connected);

    const status = harness.adapter.getStatus();
    expect(status.portPath).toBe("COM3");
    expect(status.firmware).toBe("basic-1");
    // More than one version query was sent (the first was lost to the reset).
    const queries = harness.transport.liveConnection().writes.filter((data) => data === "v\n");
    expect(queries.length).toBeGreaterThan(1);
  });

  it("detects a basic box whose version reply has no line terminator", async () => {
    // Real basic_msg boxes answer `v` with a bare `basic-1` and no CR/LF, so the line decoder never
    // emits it; the probe must sniff the raw bytes to recognize the box.
    const harness = makeAdapter([
      { path: "COM3", vendorId: "0403", firmware: "basic-1", omitVersionTerminator: true }
    ]);
    active = harness.adapter;

    await waitFor(() => harness.adapter.getStatus().connected);

    const status = harness.adapter.getStatus();
    expect(status.portPath).toBe("COM3");
    expect(status.firmware).toBe("basic-1");
  });

  it("prioritizes known vendor ports but never excludes an unknown one", async () => {
    // Only an unknown-vendor port is present, and it is the box — it must still be found.
    const harness = makeAdapter([
      { path: "/dev/ttyUSB0", vendorId: "abcd", firmware: "SS_v0.1.7" }
    ]);
    active = harness.adapter;

    await waitFor(() => harness.adapter.getStatus().connected);
    expect(harness.adapter.getStatus().portPath).toBe("/dev/ttyUSB0");
  });

  it("skips ports with no USB vendor ID instead of probing them", async () => {
    // macOS lists built-in Bluetooth and debug ports; the box is always USB, so they're never opened.
    const harness = makeAdapter([
      { path: "/dev/tty.Bluetooth-Incoming-Port", vendorId: null, firmware: null },
      { path: "/dev/tty.usbserial-A1", vendorId: "abcd", firmware: "basic-1" }
    ]);
    active = harness.adapter;

    await waitFor(() => harness.adapter.getStatus().connected);
    expect(harness.adapter.getStatus().portPath).toBe("/dev/tty.usbserial-A1");
    expect(harness.transport.openedPaths).not.toContain("/dev/tty.Bluetooth-Incoming-Port");
  });

  it("binds a manual port override directly even without a version reply", async () => {
    // The override is the escape hatch, so it binds even a port with no USB vendor ID.
    const harness = makeAdapter([{ path: "/dev/ttyForced", vendorId: null, firmware: null }], {
      ROLLER_RUMBLE_SENSOR_PORT: "/dev/ttyForced"
    });
    active = harness.adapter;

    await waitFor(() => harness.adapter.getStatus().connected);
    const status = harness.adapter.getStatus();
    expect(status.portPath).toBe("/dev/ttyForced");
    expect(status.manualPortOverride).toBe("/dev/ttyForced");
  });

  it("arms the box with d/l/g, then relays GO and rotation deltas", async () => {
    const harness = makeAdapter([{ path: "/dev/ttyBox", firmware: "SS_v0.1.7" }]);
    active = harness.adapter;
    await waitFor(() => harness.adapter.getStatus().connected);

    harness.adapter.armCountdown(PARTICIPANTS);
    const box = harness.transport.liveConnection();
    expect(box.writes).toEqual(["v\n", "d\n", "l1000000\n", "g\n"]);

    box.emit("CD:0\r\n");
    box.emit("R:2,1,0,0,100\r\n");

    expect(harness.lifecycle).toContainEqual({ type: "go" });
    expect(harness.rotations).toEqual([
      {
        racerId: "r-left",
        lane: "left",
        timestampMs: 10_100,
        deltaRotations: 2,
        metersPerRotation: ROLLOUT
      },
      {
        racerId: "r-right",
        lane: "right",
        timestampMs: 10_100,
        deltaRotations: 1,
        metersPerRotation: ROLLOUT
      }
    ]);
  });

  it("applies the configured lane map when relaying ticks", async () => {
    const harness = makeAdapter([{ path: "/dev/ttyBox", firmware: "SS_v0.1.7" }], {
      ROLLER_RUMBLE_SENSOR_LANE_MAP: "right,left"
    });
    active = harness.adapter;
    await waitFor(() => harness.adapter.getStatus().connected);

    harness.adapter.armCountdown(PARTICIPANTS);
    const box = harness.transport.liveConnection();
    box.emit("CD:0\r\n");
    box.emit("R:5,0,0,0,100\r\n");

    // Sensor port 0 is wired to the right lane, so its ticks go to the right racer.
    expect(harness.rotations).toEqual([
      {
        racerId: "r-right",
        lane: "right",
        timestampMs: 10_100,
        deltaRotations: 5,
        metersPerRotation: ROLLOUT
      }
    ]);
  });

  it("arms a Variant B box with a binary length and decodes its multi-line progress", async () => {
    const harness = makeAdapter([{ path: "/dev/ttyB", firmware: "basic-1" }]);
    active = harness.adapter;
    await waitFor(() => harness.adapter.getStatus().connected);
    expect(harness.adapter.getStatus().firmware).toBe("basic-1");

    harness.adapter.armCountdown(PARTICIPANTS);
    const box = harness.transport.liveConnection();
    // v probe, then the binary length (l + 0x7fff little-endian + \r), then g.
    expect(box.writes[0]).toBe("v\n");
    expect(box.writes[1]).toEqual(Uint8Array.of(0x6c, 0xff, 0x7f, 0x0d));
    expect(box.writes[2]).toBe("g\n");

    box.emit("0: 4\r\n1: 2\r\nt: 100\r\n");

    expect(harness.lifecycle).toContainEqual({ type: "go" });
    expect(harness.rotations).toEqual([
      // No CD: on this variant: the first sample, 100ms after the box's GO, arrived at 10_000.
      {
        racerId: "r-left",
        lane: "left",
        timestampMs: 10_000,
        deltaRotations: 4,
        metersPerRotation: ROLLOUT
      },
      {
        racerId: "r-right",
        lane: "right",
        timestampMs: 10_000,
        deltaRotations: 2,
        metersPerRotation: ROLLOUT
      }
    ]);
  });

  it("arms a forced Variant C box and decodes its bitmask packets", async () => {
    const harness = makeAdapter([{ path: "/dev/ttyC", firmware: null }], {
      ROLLER_RUMBLE_SENSOR_PORT: "/dev/ttyC",
      ROLLER_RUMBLE_SENSOR_PROTOCOL: "advanced"
    });
    active = harness.adapter;
    await waitFor(() => harness.adapter.getStatus().connected);

    harness.adapter.armCountdown(PARTICIPANTS);
    const box = harness.transport.liveConnection();
    // The probe re-queries `v` until it gives up (Variant C never answers); those queries all
    // precede arming. What matters here: arming a Variant C box sends only GO, no length command.
    expect(box.writes.filter((data) => data !== "v\n")).toEqual(["g\n"]);

    // 'b'=mask 1 (racer 0), 'c'=mask 2 (racer 1), 'd'=mask 3 (both).
    box.emit("!50@bcd#");

    expect(harness.rotations).toEqual([
      {
        racerId: "r-left",
        lane: "left",
        timestampMs: 10_000,
        deltaRotations: 2,
        metersPerRotation: ROLLOUT
      },
      {
        racerId: "r-right",
        lane: "right",
        timestampMs: 10_000,
        deltaRotations: 2,
        metersPerRotation: ROLLOUT
      }
    ]);
  });

  it("sends the stop command on endRace", async () => {
    const harness = makeAdapter([{ path: "/dev/ttyBox", firmware: "SS_v0.1.7" }]);
    active = harness.adapter;
    await waitFor(() => harness.adapter.getStatus().connected);

    harness.adapter.armCountdown(PARTICIPANTS);
    const box = harness.transport.liveConnection();
    box.writes.length = 0;
    harness.adapter.endRace();
    expect(box.writes).toEqual(["s\n"]);
  });

  it("surfaces a disconnect as a status change and a lifecycle abort", async () => {
    const harness = makeAdapter([{ path: "/dev/ttyBox", firmware: "SS_v0.1.7" }]);
    active = harness.adapter;
    await waitFor(() => harness.adapter.getStatus().connected);

    harness.adapter.armCountdown(PARTICIPANTS);
    harness.adapter.beginRace();
    harness.statuses.length = 0;
    harness.lifecycle.length = 0;

    harness.transport.liveConnection().drop(new Error("device unplugged"));

    expect(harness.adapter.getStatus().connected).toBe(false);
    expect(harness.statuses.some((status) => !status.connected)).toBe(true);
    expect(harness.lifecycle).toContainEqual({
      type: "abort",
      reason: "The race box disconnected."
    });
  });

  it("reconnects on the next poll after a disconnect", async () => {
    const harness = makeAdapter([{ path: "/dev/ttyBox", firmware: "SS_v0.1.7" }]);
    active = harness.adapter;
    await waitFor(() => harness.adapter.getStatus().connected);

    harness.transport.liveConnection().drop(new Error("device unplugged"));
    expect(harness.adapter.getStatus().connected).toBe(false);

    await waitFor(() => harness.adapter.getStatus().connected);
    expect(harness.adapter.getStatus().connected).toBe(true);
  });

  it("reads the rollout from the managed setting", () => {
    const harness = makeAdapter([{ path: "/dev/ttyBox", firmware: "SS_v0.1.7" }], {
      ROLLER_RUMBLE_SENSOR_ROLLOUT_METERS: "0.36"
    });
    active = harness.adapter;
    expect(harness.adapter.wheelCircumferenceMeters).toBe(0.36);
  });

  it("measures each port with its own per-port rollout", async () => {
    const harness = makeAdapter([{ path: "/dev/ttyBox", firmware: "SS_v0.1.7" }], {
      ROLLER_RUMBLE_SENSOR_PORT_ROLLOUT_METERS: ",0.2"
    });
    active = harness.adapter;
    await waitFor(() => harness.adapter.getStatus().connected);

    harness.adapter.armCountdown(PARTICIPANTS);
    const box = harness.transport.liveConnection();
    box.emit("CD:0\r\n");
    box.emit("R:1,1,0,0,100\r\n");

    expect(harness.rotations.map((event) => event.metersPerRotation)).toEqual([ROLLOUT, 0.2]);
  });

  describe("sensor test", () => {
    it("arms the box outside a race and shows its raw ticks without feeding any racer", async () => {
      const harness = makeAdapter([{ path: "/dev/ttyB", firmware: "basic-1" }]);
      active = harness.adapter;
      await waitFor(() => harness.adapter.getStatus().connected);
      const notified = vi.fn();
      harness.adapter.onMonitorChange(notified);

      harness.adapter.startSensorTest();
      const box = harness.transport.liveConnection();
      expect(box.writes.slice(1)).toEqual([Uint8Array.of(0x6c, 0xff, 0x7f, 0x0d), "g\n"]);

      box.emit("0: 3\r\n1: 7\r\n2: 0\r\n3: 0\r\nt: 251\r\n");

      const monitor = harness.adapter.getMonitor();
      expect(monitor.mode).toBe("testing");
      expect(monitor.ports.map((port) => port.ticks)).toEqual([3, 7, 0, 0]);
      expect(monitor.recentLines).toEqual(["0: 3", "1: 7", "2: 0", "3: 0", "t: 251"]);
      expect(harness.rotations).toEqual([]);
      expect(notified).toHaveBeenCalled();
    });

    it("refuses to start while a race has the box", async () => {
      const harness = makeAdapter([{ path: "/dev/ttyBox", firmware: "SS_v0.1.7" }]);
      active = harness.adapter;
      await waitFor(() => harness.adapter.getStatus().connected);

      harness.adapter.armCountdown(PARTICIPANTS);
      expect(() => harness.adapter.startSensorTest()).toThrow(/race/i);
    });

    it("refuses to start with no box connected", () => {
      const harness = makeAdapter([]);
      active = harness.adapter;
      expect(() => harness.adapter.startSensorTest()).toThrow(/not connected/i);
    });

    it("stops the box again once its countdown ends if stopped during it", async () => {
      // basic_msg ignores STOP during its silent countdown, then streams anyway.
      const harness = makeAdapter([{ path: "/dev/ttyB", firmware: "basic-1" }], {
        ROLLER_RUMBLE_SENSOR_BOX_COUNTDOWN_MS: "10"
      });
      active = harness.adapter;
      await waitFor(() => harness.adapter.getStatus().connected);

      harness.adapter.startSensorTest();
      const box = harness.transport.liveConnection();
      box.writes.length = 0;
      harness.adapter.stopSensorTest();
      expect(box.writes).toEqual(["s\n"]);
      expect(harness.adapter.getMonitor().mode).toBe("idle");

      await waitFor(() => box.writes.length === 2);
      expect(box.writes).toEqual(["s\n", "s\n"]);
    });

    it("hands the box to a race that arms mid-test", async () => {
      const harness = makeAdapter([{ path: "/dev/ttyBox", firmware: "SS_v0.1.7" }]);
      active = harness.adapter;
      await waitFor(() => harness.adapter.getStatus().connected);

      harness.adapter.startSensorTest();
      harness.adapter.armCountdown(PARTICIPANTS);
      expect(harness.adapter.getMonitor().mode).toBe("racing");
    });
  });

  it("logs every raw line when raw logging is on", async () => {
    const info = vi.spyOn(console, "info");
    try {
      const harness = makeAdapter([{ path: "/dev/ttyB", firmware: "basic-1" }], {
        ROLLER_RUMBLE_SENSOR_RAW_LOGGING: "on"
      });
      active = harness.adapter;
      await waitFor(() => harness.adapter.getStatus().connected);

      harness.transport.liveConnection().emit("t: 251\r\n");

      expect(info).toHaveBeenCalledWith('[sensor] raw: "t: 251"');
    } finally {
      info.mockRestore();
    }
  });
});
