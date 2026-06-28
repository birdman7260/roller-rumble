import type { RaceParticipant } from "@roller-rumble/shared/types";

export interface RotationEvent {
  lane: RaceParticipant["lane"];
  racerId: string;
  timestampMs: number;
  deltaRotations: number;
}

export type RotationListener = (event: RotationEvent) => void;

/**
 * Lifecycle signals from an adapter that runs its own countdown — the hardware
 * box counts `3-2-1-GO` itself, so it tells the app where it is rather than the
 * app driving a timer. Adapters that let the app own the countdown (e.g. the
 * simulator) never emit these.
 *
 * - `countdown` — a step toward GO; `secondsRemaining` lets the app's countdown
 *   UI track the box's real cadence instead of guessing the duration.
 * - `go` — the box has finished counting and is now streaming; the app activates
 *   the race in response.
 * - `abort` — the box bailed out of the countdown (e.g. disconnect); the app
 *   reverts the race rather than starting it.
 */
export type SensorLifecycleEvent =
  | { type: "countdown"; secondsRemaining: number }
  | { type: "go" }
  | { type: "abort"; reason: string };

export type SensorLifecycleListener = (event: SensorLifecycleEvent) => void;

/**
 * The live connection state of a sensor adapter, surfaced on the subsystem-health panel and used
 * by the app to interrupt a race if the box drops out mid-race. Adapters that can't lose their
 * connection (e.g. the simulator) need not implement the status channel; the app synthesizes a
 * ready status for them.
 */
export interface SensorStatus {
  adapterId: string;
  label: string;
  /** True once a usable device is open (and, for the box, confirmed by a version handshake). */
  connected: boolean;
  /** Plain-language one-liner for the operator ("Connected to COM3", "Searching for the box…"). */
  detail: string;
  /** The serial port currently bound, or null when none is open. */
  portPath: string | null;
  /** Firmware string reported by the box's `v` handshake, when known. */
  firmware: string | null;
  /** The operator's manual port override, when one is set (auto-detect is bypassed). */
  manualPortOverride: string | null;
  lastError: string | null;
}

export type SensorStatusListener = (status: SensorStatus) => void;

export interface SensorAdapter {
  id: string;
  label: string;
  /**
   * True when this adapter owns the GO signal and emits its own countdown, so
   * the app must defer to its lifecycle events instead of running its own
   * countdown timer. Absent/false means the app keeps owning the countdown.
   */
  readonly drivesCountdown?: boolean;
  /**
   * Meters a bike travels per one reported rotation, used to turn rotation deltas into distance.
   * One roller revolution is a different distance than a bike-wheel revolution, so a hardware
   * adapter overrides this with its measured roller rollout; absent means the race engine uses the
   * shared default (`DEFAULT_WHEEL_CIRCUMFERENCE_METERS`).
   */
  readonly wheelCircumferenceMeters?: number;
  connect(listener: RotationListener): Promise<void> | void;
  /**
   * Subscribe to lifecycle events. Only meaningful for a `drivesCountdown`
   * adapter; others may omit it entirely.
   */
  onLifecycle?(listener: SensorLifecycleListener): void;
  /**
   * Begin the hardware countdown sequence (sends GO to the box). Called when the
   * app enters countdown for a `drivesCountdown` adapter; a no-op/absent for
   * adapters whose countdown the app drives itself.
   */
  armCountdown?(participants: RaceParticipant[]): void;
  /**
   * Subscribe to connection-state changes. Only meaningful for an adapter that can connect/drop a
   * real device; the simulator omits it. The app uses this both for the health surface and to
   * interrupt an in-flight race when the device disconnects.
   */
  onStatusChange?(listener: SensorStatusListener): void;
  /** Current connection state, when the adapter tracks one. */
  getStatus?(): SensorStatus;
  disconnect(): Promise<void> | void;
  beginRace(participants: RaceParticipant[]): void;
  endRace(): void;
}
