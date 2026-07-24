import type { RaceRecord } from "@roller-rumble/shared/types";
import type { SensorAdapter } from "../adapters/sensor";

/**
 * The slice of the sensor adapter a countdown drives: whether the box runs its own silent
 * countdown (`drivesCountdown`), the command that arms it (`armCountdown`), and the command that
 * silences it on abort (`endRace`). Write-only — the countdown never subscribes to the box; the
 * coordinator owns the lifecycle/status subscriptions.
 */
export type CountdownArmingPort = Pick<
  SensorAdapter,
  "drivesCountdown" | "armCountdown" | "endRace"
>;

export interface RaceCountdownOptions {
  armingPort: CountdownArmingPort;
  /**
   * The box's silent countdown length. The pre-roll delays the box's `g` by
   * `max(0, N − boxCountdownMs)` so the silence becomes the tail of the app countdown (ADR 0010).
   */
  boxCountdownMs: number;
  /** Fired on the 250ms cadence so the coordinator re-broadcasts the ticking countdown clock. */
  onTick: () => void;
  /**
   * Fired once, at the music-locked GO instant (N), after the countdown has torn down its own
   * timers. The coordinator activates the race in response.
   */
  onGo: (raceId: string) => void;
}

export interface RaceCountdownTiming {
  raceId: string;
  /** Wall-clock start of the countdown; the snapshot derives remaining time from this. */
  startedAtMs: number;
  durationMs: number;
}

const TICK_INTERVAL_MS = 250;

/**
 * The live, in-process owner of a single race's countdown, from the start trigger through `GO`
 * (see CONTEXT.md `RaceCountdown`, ADR 0010, ADR 0017). Owns the app-owned visible countdown: the
 * 250ms re-broadcast cadence, the music-locked GO timer that fires at `N` on its own clock, and —
 * for a box that runs its own silent countdown — the `pre-roll` that delays the box's `g` so the
 * box's silence lands on GO.
 *
 * Holds its timing in memory only, never persisted: the coordinator reads {@link getTiming} to
 * project the remaining seconds into the snapshot and owns every persisted race-state write. The
 * module signals outward through the injected `onTick`/`onGo` callbacks and never emits a snapshot
 * itself (the "leaf never emits" rule, ADR 0003). Exactly one countdown runs at a time, or none.
 */
export class RaceCountdown {
  private readonly armingPort: CountdownArmingPort;
  private readonly boxCountdownMs: number;
  private readonly onTick: () => void;
  private readonly onGo: (raceId: string) => void;

  private ticker: NodeJS.Timeout | null = null;
  private goTimer: NodeJS.Timeout | null = null;
  // The pre-roll (delayed-GO) timer for a box that runs its own silent countdown: `g` is held until
  // the tail of the app-owned countdown so the box's silence lands on GO (ADR 0010).
  private armGoTimer: NodeJS.Timeout | null = null;
  private timing: RaceCountdownTiming | null = null;
  // Set while a box-driven countdown is in flight, so abort silences the box and a stray abort with
  // nothing counting is a harmless no-op.
  private hardwareCountdown = false;

  constructor(options: RaceCountdownOptions) {
    this.armingPort = options.armingPort;
    this.boxCountdownMs = options.boxCountdownMs;
    this.onTick = options.onTick;
    this.onGo = options.onGo;
  }

  /** The live countdown timing, or null when no countdown is running. */
  getTiming(): RaceCountdownTiming | null {
    return this.timing;
  }

  /**
   * Begin the countdown for an already-staged race. Stamps the start instant on its own clock, runs
   * the 250ms re-broadcast ticker and the GO timer that fires at `durationMs`, and — for a box
   * adapter — arms the box after the pre-roll. Replaces any countdown already in flight.
   */
  start(input: { race: RaceRecord; durationMs: number }): void {
    // Replace any countdown/timers already running before starting the new one.
    this.teardownTimers();

    const { race, durationMs } = input;
    this.timing = {
      raceId: race.id,
      startedAtMs: Date.now(),
      durationMs
    };

    // Countdown time is derived from startedAtMs, so the ticker just asks for a re-broadcast.
    this.ticker = setInterval(() => this.onTick(), TICK_INTERVAL_MS);

    // The app owns the whole visible countdown and fires GO on its own clock at N — music-locked, so
    // an OS2L cue's start lands exactly where the DJ placed it (ADR 0010). True for the simulator
    // and the box alike; the box's own timing never triggers activation.
    this.goTimer = setTimeout(() => this.reachGo(race.id), durationMs);

    if (this.armingPort.drivesCountdown) {
      // The box runs its own silent countdown after `g`. Delay `g` by the pre-roll
      // `max(0, N − boxCountdownMs)` so the silence becomes the tail of the app countdown and the
      // box is streaming by the time GO fires. When N is at or below the box countdown, the pre-roll
      // clamps to zero (send `g` now) and the box's ticks simply arrive a beat late — the
      // unavoidable hardware floor.
      this.hardwareCountdown = true;
      const preRollMs = Math.max(0, durationMs - this.boxCountdownMs);
      if (preRollMs === 0) {
        this.armingPort.armCountdown?.(race.participants);
      } else {
        this.armGoTimer = setTimeout(() => {
          this.armGoTimer = null;
          this.armingPort.armCountdown?.(race.participants);
        }, preRollMs);
      }
    }
  }

  /**
   * Stop a countdown before GO — an operator reset or a box abort. Tears down every timer, silences
   * the box if this was a box-driven countdown, and forgets the timing. Idempotent: a no-op when
   * nothing is counting, so a late box abort after teardown does nothing. The coordinator owns the
   * accompanying race-state revert and any logging.
   */
  abort(): void {
    if (!this.timing) {
      return;
    }
    const wasHardware = this.hardwareCountdown;
    this.teardownTimers();
    this.timing = null;
    this.hardwareCountdown = false;
    if (wasHardware) {
      this.armingPort.endRace();
    }
  }

  /** Tear down timers and state without side effects — used on shutdown. */
  dispose(): void {
    this.teardownTimers();
    this.timing = null;
    this.hardwareCountdown = false;
  }

  private reachGo(raceId: string): void {
    this.teardownTimers();
    this.timing = null;
    this.hardwareCountdown = false;
    this.onGo(raceId);
  }

  private teardownTimers(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    if (this.goTimer) {
      clearTimeout(this.goTimer);
      this.goTimer = null;
    }
    if (this.armGoTimer) {
      clearTimeout(this.armGoTimer);
      this.armGoTimer = null;
    }
  }
}
