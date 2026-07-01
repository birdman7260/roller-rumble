/**
 * Serial transport for the OpenSprints race box: the real {@link SensorAdapter} that the pure
 * {@link OpenSprintsSession} plugs into. It owns all the I/O the session deliberately avoids —
 * port discovery, opening, byte decoding, reconnection — and forwards decoded messages into the
 * session, whose rotation/lifecycle output it relays to the app.
 *
 * Design follows docs/adr/0005-opensprints-as-dumb-sensor.md:
 * - The box is a dumb tick streamer; the app owns the race. We send GO only to start streaming.
 * - Port detection is probe-and-confirm: open a candidate, send `v`, accept only a real `V:` reply.
 *   VID/PID only prioritizes probe order — it never hard-filters, so a board revision can't lock us
 *   out. A manual port override bypasses discovery entirely as the live-event escape hatch.
 * - The box zeroes its tick counters on every GO, so a mid-race reconnect can't cleanly resume; a
 *   disconnect is surfaced as a status change (the app interrupts the race) plus a lifecycle abort
 *   (so a countdown waiting on GO bails out promptly instead of stranding).
 *
 * The serial layer is injected behind {@link SerialTransport} so this adapter is unit-testable with
 * a fake; the real transport lazily imports the native `serialport` module only when constructed.
 */

import {
  buildArmCommands,
  buildStopCommands,
  createOpenSprintsDecoder,
  OPENSPRINTS_VERSION_QUERY,
  type OpenSprintsVariant,
  type SerialCommand
} from "./opensprints-protocol";
import { OpenSprintsSession } from "./opensprints-session";
import {
  readSensorLaneAssignments,
  readSensorPortOverride,
  readSensorProtocol,
  readSensorRolloutMeters
} from "./sensor-config";
import type {
  RotationListener,
  SensorAdapter,
  SensorLifecycleEvent,
  SensorLifecycleListener,
  SensorStatus,
  SensorStatusListener
} from "./sensor";
import type { RaceParticipant } from "@roller-rumble/shared/types";

/** OpenSprints / SilverSprint serial settings. */
const BAUD_RATE = 115200;
/** How often to retry discovery while disconnected. */
const RECONNECT_INTERVAL_MS = 1000;
/**
 * How long to wait for a version reply before rejecting a probed port. Opening the port toggles
 * DTR, which resets the Arduino; its bootloader runs for ~2s before the sketch can answer, so this
 * must comfortably outlast that boot or every probe times out on a booting board (the symptom:
 * "still searching" even though the port is the box).
 */
const PROBE_TIMEOUT_MS = 5000;
/** How often to re-send the version query within the probe window, so at least one lands post-boot. */
const PROBE_QUERY_INTERVAL_MS = 400;

/**
 * USB-serial vendor IDs (lowercase hex) known to front OpenSprints-class Arduinos. Used only to
 * order which ports we probe first — never to exclude a port (see ADR 0005).
 */
const PRIORITIZED_VENDOR_IDS: readonly string[] = [
  "2341", // Arduino
  "2a03", // Arduino (.org)
  "10c4", // Silicon Labs CP210x
  "1a86", // QinHeng CH340
  "0403", // FTDI
  "067b" // Prolific
];

export interface SerialPortInfo {
  path: string;
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
}

/** A single open serial connection. `onData`/`onClose` install one handler each (last wins). */
export interface SerialConnection {
  write(data: SerialCommand): void;
  close(): void;
  onData(handler: (chunk: string) => void): void;
  onClose(handler: (error: Error | null) => void): void;
}

/** The minimal serial surface the adapter needs; the real one wraps `serialport`. */
export interface SerialTransport {
  list(): Promise<SerialPortInfo[]>;
  open(path: string): Promise<SerialConnection>;
}

/** Outcome of a `v` handshake on a candidate port. */
interface ProbeResult {
  firmware: string | null;
  variant: OpenSprintsVariant;
}

/** A confirmed, open port ready to attach. */
interface OpenedPort extends ProbeResult {
  connection: SerialConnection;
  portPath: string;
}

export interface OpenSprintsSensorAdapterOptions {
  /** Injectable serial layer; defaults to the real `serialport`-backed transport. */
  createTransport?: () => Promise<SerialTransport>;
  /** Injectable env source for the managed sensor settings (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Injectable wall clock passed to the session (defaults to `Date.now`). */
  now?: () => number;
  /** Probe reply timeout in ms (overridable so tests don't wait real seconds). */
  probeTimeoutMs?: number;
  /** How often to re-send the version query during a probe, in ms (overridable for tests). */
  probeQueryIntervalMs?: number;
  /** Reconnect poll interval in ms (overridable for tests). */
  reconnectIntervalMs?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * The minimal slice of the native `serialport` API this transport uses. Declaring it locally and
 * bridging the dynamic import through it keeps the native-module boundary explicit and type-safe,
 * independent of how the bundler/linter resolves the package's own (CJS) declarations.
 */
interface SerialPortLike {
  isOpen: boolean;
  write(data: string | Buffer): void;
  close(): void;
  set(options: { dtr?: boolean; rts?: boolean }, callback?: (error: Error | null) => void): void;
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

interface SerialPortModule {
  SerialPort: {
    list(): Promise<SerialPortInfo[]>;
    new (
      options: { path: string; baudRate: number; autoOpen: boolean },
      callback: (error: Error | null) => void
    ): SerialPortLike;
  };
}

/** Build the real serialport-backed transport, importing the native module lazily. */
async function createSerialPortTransport(): Promise<SerialTransport> {
  const { SerialPort } = (await import("serialport")) as unknown as SerialPortModule;
  return {
    async list(): Promise<SerialPortInfo[]> {
      const ports = await SerialPort.list();
      return ports.map((port) => ({
        path: port.path,
        vendorId: port.vendorId,
        productId: port.productId,
        manufacturer: port.manufacturer
      }));
    },
    open(path: string): Promise<SerialConnection> {
      return new Promise<SerialConnection>((resolve, reject) => {
        const port = new SerialPort({ path, baudRate: BAUD_RATE, autoOpen: true }, (error) => {
          if (error) {
            reject(error);
            return;
          }
          let onData: ((chunk: string) => void) | null = null;
          let onClose: ((error: Error | null) => void) | null = null;
          port.on("data", (chunk: Buffer) => onData?.(chunk.toString("utf8")));
          port.on("close", () => onClose?.(null));
          port.on("error", (closeError: Error) => onClose?.(closeError));
          // Assert DTR (and clear RTS) so the board is released from reset and (re)boots — this mirrors
          // the standalone probe that set DtrEnable=true and then heard back. Some FTDI/Arduino boards
          // otherwise sit held in reset on open and never answer the version query. Fire-and-forget:
          // the probe re-queries across its whole window, so we don't need to await the toggle.
          port.set({ dtr: true, rts: false }, () => undefined);
          resolve({
            write: (data: SerialCommand) =>
              port.write(typeof data === "string" ? data : Buffer.from(data)),
            close: () => {
              if (port.isOpen) {
                port.close();
              }
            },
            onData: (handler) => {
              onData = handler;
            },
            onClose: (handler) => {
              onClose = handler;
            }
          });
        });
      });
    }
  };
}

export class OpenSprintsSensorAdapter implements SensorAdapter {
  readonly id = "opensprints";
  readonly label = "OpenSprints USB box";
  readonly drivesCountdown = true;

  get wheelCircumferenceMeters(): number {
    return readSensorRolloutMeters(this.env);
  }

  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => number;
  private readonly createTransport: () => Promise<SerialTransport>;
  private readonly probeTimeoutMs: number;
  private readonly probeQueryIntervalMs: number;
  private readonly reconnectIntervalMs: number;
  private transport: SerialTransport | null = null;
  // Log the serial-driver load failure only once so a persistent failure doesn't spam the log
  // every reconnect poll. The port scan is logged only when it changes (see noteScan).
  private transportErrorLogged = false;
  private lastScanSignature: string | null = null;

  private rotationListener: RotationListener | null = null;
  private readonly lifecycleListeners: SensorLifecycleListener[] = [];
  private readonly statusListeners: SensorStatusListener[] = [];

  private session: OpenSprintsSession;
  private decoder = createOpenSprintsDecoder();
  // The firmware dialect used to build arm/stop commands, fixed once the port is confirmed.
  private variant: OpenSprintsVariant = "unknown";
  private connection: SerialConnection | null = null;
  private connecting = false;
  private disposed = false;
  private raceActive = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private status: SensorStatus = {
    adapterId: this.id,
    label: this.label,
    connected: false,
    detail: "Not started.",
    portPath: null,
    firmware: null,
    manualPortOverride: null,
    lastError: null
  };

  constructor(options: OpenSprintsSensorAdapterOptions = {}) {
    this.env = options.env ?? process.env;
    this.now = options.now ?? Date.now;
    this.createTransport = options.createTransport ?? createSerialPortTransport;
    this.probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
    this.probeQueryIntervalMs = options.probeQueryIntervalMs ?? PROBE_QUERY_INTERVAL_MS;
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? RECONNECT_INTERVAL_MS;
    this.session = this.createSession();
  }

  connect(listener: RotationListener): void {
    this.rotationListener = listener;
    this.disposed = false;
    const override = readSensorPortOverride(this.env);
    console.info(
      `[sensor] OpenSprints adapter searching for the race box${override ? ` (forced port ${override})` : " (auto-detect)"}.`
    );
    this.updateStatus({
      detail: "Searching for the race box…",
      manualPortOverride: override
    });
    this.startReconnectLoop();
    void this.tryConnect();
  }

  onLifecycle(listener: SensorLifecycleListener): void {
    this.lifecycleListeners.push(listener);
  }

  onStatusChange(listener: SensorStatusListener): void {
    this.statusListeners.push(listener);
  }

  getStatus(): SensorStatus {
    return this.status;
  }

  armCountdown(participants: RaceParticipant[]): void {
    // Rebuild the session so an edited lane map applies to this race without a reconnect.
    this.session = this.createSession();
    this.session.begin(participants);
    if (!this.connection) {
      this.emitLifecycle({ type: "abort", reason: "The race box is not connected." });
      return;
    }
    this.raceActive = true;
    this.writeCommands(buildArmCommands(this.variant));
  }

  beginRace(): void {
    // The box is already streaming from the GO sent in armCountdown; there is nothing to send. We
    // only note that a race is live so a disconnect knows to interrupt it.
    this.raceActive = true;
  }

  endRace(): void {
    this.session.end();
    if (this.connection) {
      this.writeCommands(buildStopCommands());
    }
    this.raceActive = false;
  }

  disconnect(): void {
    this.disposed = true;
    this.raceActive = false;
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeConnection();
    this.rotationListener = null;
    this.updateStatus({ connected: false, portPath: null, detail: "Sensor stopped." });
  }

  private createSession(): OpenSprintsSession {
    return new OpenSprintsSession({
      onRotation: (event) => this.rotationListener?.(event),
      onLifecycle: (event) => this.emitLifecycle(event),
      laneAssignments: readSensorLaneAssignments(this.env) ?? undefined,
      now: this.now
    });
  }

  private startReconnectLoop(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setInterval(() => {
      if (!this.connection && !this.connecting && !this.disposed) {
        void this.tryConnect();
      }
    }, this.reconnectIntervalMs);
    // Don't keep the process alive just for the reconnect poll.
    this.reconnectTimer.unref();
  }

  /** Read behind a method so callers after an `await` aren't narrowed to a stale value. */
  private isDisposed(): boolean {
    return this.disposed;
  }

  private async tryConnect(): Promise<void> {
    if (this.disposed || this.connection || this.connecting) {
      return;
    }
    this.connecting = true;
    try {
      this.transport ??= await this.loadTransport();
      const override = readSensorPortOverride(this.env);
      const opened = await this.openPort(this.transport, override);
      if (!opened) {
        this.updateStatus({
          connected: false,
          detail: override
            ? `Could not reach the race box on ${override}.`
            : "No race box found yet — still searching."
        });
        return;
      }
      if (this.isDisposed()) {
        opened.connection.close();
        return;
      }
      this.attachConnection(opened, override);
    } catch (error) {
      this.updateStatus({
        connected: false,
        detail: "Could not connect to the race box.",
        lastError: errorMessage(error)
      });
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Load the native serial driver, logging success once and any failure once. A failure here
   * (e.g. the `serialport` native module not being built for this Electron/Node ABI, or missing
   * from a packaged build) means the box can never be found, so it is the first thing to check.
   */
  private async loadTransport(): Promise<SerialTransport> {
    try {
      const transport = await this.createTransport();
      console.info("[sensor] serial driver (serialport) loaded.");
      return transport;
    } catch (error) {
      if (!this.transportErrorLogged) {
        this.transportErrorLogged = true;
        console.error(
          "[sensor] FAILED to load the serial driver (serialport native module). The race box " +
            "cannot be detected until this is fixed — usually a native rebuild for this app's " +
            "Electron version (pnpm rebuild:native), or a packaged build missing the .node binary.",
          errorMessage(error)
        );
      }
      throw error;
    }
  }

  /**
   * Log the current serial-port scan, but only when it changes, so the reconnect poll doesn't spam
   * the log every second. Returns whether this scan is new, so per-port probe outcomes are logged
   * once per distinct scan rather than every poll.
   */
  private noteScan(ports: SerialPortInfo[]): boolean {
    const signature = ports
      .map((port) => `${port.path}|${port.vendorId ?? "?"}:${port.productId ?? "?"}`)
      .join(",");
    if (signature === this.lastScanSignature) {
      return false;
    }
    this.lastScanSignature = signature;
    if (ports.length === 0) {
      console.warn(
        "[sensor] no serial ports detected. Is the box plugged in, and is its USB-serial driver installed?"
      );
    } else {
      console.info(
        `[sensor] found ${ports.length} serial port(s): ` +
          ports
            .map(
              (port) =>
                `${port.path} [vid=${port.vendorId ?? "?"} pid=${port.productId ?? "?"}${port.manufacturer ? ` ${port.manufacturer}` : ""}]`
            )
            .join(", ")
      );
    }
    return true;
  }

  private async openPort(
    transport: SerialTransport,
    override: string | null
  ): Promise<OpenedPort | null> {
    if (override) {
      // The operator forced a port: bind it directly (escape hatch), still learning the firmware if
      // it answers, but never rejecting it for a missing reply.
      let connection: SerialConnection;
      try {
        connection = await transport.open(override);
      } catch (error) {
        console.warn(`[sensor] could not open forced port ${override}: ${errorMessage(error)}`);
        throw error;
      }
      const probed = await this.probe(connection);
      console.info(
        `[sensor] forced port ${override} ${probed.firmware ? `answered "${probed.firmware}" (variant ${probed.variant})` : "sent no version reply; binding it anyway"}.`
      );
      return { connection, portPath: override, ...probed };
    }

    const ports = this.prioritize(await transport.list());
    const verbose = this.noteScan(ports);
    for (const port of ports) {
      let connection: SerialConnection;
      try {
        connection = await transport.open(port.path);
      } catch (error) {
        if (verbose) {
          console.warn(`[sensor] could not open ${port.path}: ${errorMessage(error)}`);
        }
        continue;
      }
      const probed = await this.probe(connection);
      if (probed.firmware !== null) {
        console.info(
          `[sensor] ${port.path} answered the version handshake: "${probed.firmware}" (variant ${probed.variant}).`
        );
        return { connection, portPath: port.path, ...probed };
      }
      if (verbose) {
        console.info(
          `[sensor] ${port.path} opened but sent no version reply within ${this.probeTimeoutMs}ms — not the box (or it never booted).`
        );
      }
      connection.close();
    }
    if (verbose && ports.length > 0) {
      console.warn(`[sensor] scanned ${ports.length} port(s); none answered as the race box.`);
    }
    return null;
  }

  /** Send `v` and resolve the firmware string + detected variant, or nulls on timeout. */
  private probe(connection: SerialConnection): Promise<ProbeResult> {
    return new Promise<ProbeResult>((resolve) => {
      const decoder = createOpenSprintsDecoder();
      let settled = false;
      let loggedRawBytes = false;
      const finish = (result: ProbeResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        clearInterval(reQuery);
        resolve(result);
      };
      const timer = setTimeout(
        () => finish({ firmware: null, variant: "unknown" }),
        this.probeTimeoutMs
      );
      timer.unref();
      connection.onData((chunk) => {
        // Log the first bytes received during a probe so diagnostics distinguish a silent board (no
        // data at all) from one that talks but isn't answering the version query as expected.
        if (!loggedRawBytes && chunk.length > 0) {
          loggedRawBytes = true;
          console.info(`[sensor] probe received bytes: ${JSON.stringify(chunk.slice(0, 200))}`);
        }
        for (const message of decoder.push(chunk)) {
          if (message.type === "version") {
            finish({ firmware: message.firmware, variant: decoder.getVariant() });
            return;
          }
        }
      });
      // Opening the port reset the board (DTR), so the first query may hit a still-booting sketch
      // and be lost. Re-send across the whole window until one lands after boot, or we time out.
      connection.write(OPENSPRINTS_VERSION_QUERY);
      const reQuery = setInterval(
        () => connection.write(OPENSPRINTS_VERSION_QUERY),
        this.probeQueryIntervalMs
      );
      reQuery.unref();
    });
  }

  /**
   * Settle on the firmware variant used to build commands: an explicit operator override wins,
   * otherwise the probe's detection, otherwise the newest dialect as a safe default.
   */
  private resolveVariant(probed: OpenSprintsVariant): OpenSprintsVariant {
    const forced = readSensorProtocol(this.env);
    if (forced !== "auto") {
      return forced;
    }
    return probed === "unknown" ? "ss-basic" : probed;
  }

  private attachConnection(opened: OpenedPort, override: string | null): void {
    this.connection = opened.connection;
    this.decoder = createOpenSprintsDecoder();
    this.variant = this.resolveVariant(opened.variant);
    opened.connection.onData((chunk) => this.handleChunk(chunk));
    opened.connection.onClose((error) => this.handleDisconnect(error));
    const descriptor = opened.firmware ?? this.variant;
    this.lastScanSignature = null; // so a later disconnect + rescan logs afresh
    console.info(
      `[sensor] connected to ${opened.portPath} (${descriptor}); using command variant "${this.variant}".`
    );
    this.updateStatus({
      connected: true,
      portPath: opened.portPath,
      firmware: opened.firmware,
      manualPortOverride: override,
      detail: `Connected to ${opened.portPath} (${descriptor}).`,
      lastError: null
    });
  }

  private handleChunk(chunk: string): void {
    for (const message of this.decoder.push(chunk)) {
      if (message.type === "version") {
        this.updateStatus({ firmware: message.firmware });
      }
      this.session.handleMessage(message);
    }
  }

  private handleDisconnect(error: Error | null): void {
    if (!this.connection) {
      return;
    }
    this.connection = null;
    console.warn(
      `[sensor] lost connection to ${this.status.portPath ?? "the race box"}${error ? `: ${errorMessage(error)}` : ""}. Reconnecting…`
    );
    this.updateStatus({
      connected: false,
      portPath: null,
      detail: "Lost connection to the race box — reconnecting…",
      lastError: error ? errorMessage(error) : this.status.lastError
    });
    // A countdown waiting on GO should bail out now rather than wait for the app's grace timer; the
    // app ignores this during an active race and interrupts that via the status change instead.
    this.emitLifecycle({ type: "abort", reason: "The race box disconnected." });
  }

  private closeConnection(): void {
    if (!this.connection) {
      return;
    }
    const connection = this.connection;
    this.connection = null;
    connection.close();
  }

  private prioritize(ports: SerialPortInfo[]): SerialPortInfo[] {
    const rank = (port: SerialPortInfo): number => {
      const index = PRIORITIZED_VENDOR_IDS.indexOf((port.vendorId ?? "").toLowerCase());
      return index === -1 ? PRIORITIZED_VENDOR_IDS.length : index;
    };
    return [...ports].sort((left, right) => rank(left) - rank(right));
  }

  private writeCommands(commands: SerialCommand[]): void {
    for (const command of commands) {
      // Commands already carry their own terminator (ASCII `\n` or binary `\r`); write verbatim.
      this.connection?.write(command);
    }
  }

  private emitLifecycle(event: SensorLifecycleEvent): void {
    for (const listener of this.lifecycleListeners) {
      listener(event);
    }
  }

  private updateStatus(patch: Partial<SensorStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }
}
