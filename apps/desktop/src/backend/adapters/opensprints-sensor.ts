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
/** How long to wait for a `V:` reply before rejecting a probed port. */
const PROBE_TIMEOUT_MS = 1500;

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
  private readonly reconnectIntervalMs: number;
  private transport: SerialTransport | null = null;

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
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? RECONNECT_INTERVAL_MS;
    this.session = this.createSession();
  }

  connect(listener: RotationListener): void {
    this.rotationListener = listener;
    this.disposed = false;
    this.updateStatus({
      detail: "Searching for the race box…",
      manualPortOverride: readSensorPortOverride(this.env)
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
      this.transport ??= await this.createTransport();
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

  private async openPort(
    transport: SerialTransport,
    override: string | null
  ): Promise<OpenedPort | null> {
    if (override) {
      // The operator forced a port: bind it directly (escape hatch), still learning the firmware if
      // it answers, but never rejecting it for a missing reply.
      const connection = await transport.open(override);
      const probed = await this.probe(connection);
      return { connection, portPath: override, ...probed };
    }

    const ports = this.prioritize(await transport.list());
    for (const port of ports) {
      let connection: SerialConnection;
      try {
        connection = await transport.open(port.path);
      } catch {
        continue;
      }
      const probed = await this.probe(connection);
      if (probed.firmware !== null) {
        return { connection, portPath: port.path, ...probed };
      }
      connection.close();
    }
    return null;
  }

  /** Send `v` and resolve the firmware string + detected variant, or nulls on timeout. */
  private probe(connection: SerialConnection): Promise<ProbeResult> {
    return new Promise<ProbeResult>((resolve) => {
      const decoder = createOpenSprintsDecoder();
      let settled = false;
      const finish = (result: ProbeResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(
        () => finish({ firmware: null, variant: "unknown" }),
        this.probeTimeoutMs
      );
      timer.unref();
      connection.onData((chunk) => {
        for (const message of decoder.push(chunk)) {
          if (message.type === "version") {
            finish({ firmware: message.firmware, variant: decoder.getVariant() });
            return;
          }
        }
      });
      connection.write(OPENSPRINTS_VERSION_QUERY);
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
