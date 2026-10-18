/**
 * Translates the OpenSprints box's parsed serial messages into the app's sensor
 * vocabulary: {@link RotationEvent}s for the race engine and
 * {@link SensorLifecycleEvent}s for the app's countdown. This is the pure bridge
 * between `opensprints-protocol.ts` (bytes → messages) and `sensor.ts` (the
 * adapter contract); it owns no I/O, so the serial transport can be added later
 * and unit tests can drive real protocol messages straight through it.
 *
 * The box is treated as a dumb tick streamer (see
 * docs/adr/0005-opensprints-as-dumb-sensor.md): we ignore its finish/false-start
 * reports and the app owns the finish line via ActiveRace. The arm/stop byte
 * sequences that drive the box live in `opensprints-protocol.ts` (they vary by
 * firmware variant); this session owns only the box→app translation and lane map.
 */

import type { RaceParticipant } from "@roller-rumble/shared/types";
import type { RotationEvent, SensorLifecycleEvent } from "./sensor";
import type { OpenSprintsMessage } from "./opensprints-protocol";
import type { SensorLaneAssignment } from "./sensor-config";
import { ceilingTicks, DEFAULT_SENSOR_LANE_ASSIGNMENTS } from "./sensor-config";
import { toBikeLane } from "@roller-rumble/shared/race-lanes";

export interface OpenSprintsSessionOptions {
  onRotation: (event: RotationEvent) => void;
  onLifecycle: (event: SensorLifecycleEvent) => void;
  /**
   * Which race lane each sensor port (by index) feeds. Each participant is matched to the sensor
   * port configured for its lane, so the box's fixed port order can't crown the wrong racer. When
   * omitted, `begin` assumes the conventional wiring ({@link DEFAULT_SENSOR_LANE_ASSIGNMENTS}).
   */
  laneAssignments?: SensorLaneAssignment[];
  /**
   * Meters per tick for each sensor port (by index), stamped onto every rotation so `ActiveRace`
   * measures each bike with its own roller. Omitted means rotations carry no per-port distance.
   */
  portRolloutMeters?: number[];
  /**
   * The fastest plausible rider, in km/h. A sample implying more is clamped to it and reported via
   * `onClamp` — the signature of a bouncing reed switch. Needs `portRolloutMeters`; null/omitted
   * means no ceiling.
   */
  maxSpeedKph?: number | null;
  onClamp?: (clamp: SensorSampleClamp) => void;
  /** Injectable wall clock (defaults to Date.now) so tests are deterministic. */
  now?: () => number;
}

/** A progress sample whose tick jump was cut down to the plausible-speed ceiling. */
export interface SensorSampleClamp {
  portIndex: number;
  rawTicks: number;
  keptTicks: number;
}

/**
 * The least box time between two zero-rotation samples for one lane. A still bike still needs a
 * sample now and then so live speed falls to zero, but `ss_basic` streams every 10ms and one zero
 * event per stream line would flood the app with snapshots.
 */
const ZERO_SAMPLE_INTERVAL_MS = 200;

export class OpenSprintsSession {
  private readonly onRotation: (event: RotationEvent) => void;
  private readonly onLifecycle: (event: SensorLifecycleEvent) => void;
  private readonly laneAssignments: SensorLaneAssignment[] | null;
  private readonly portRolloutMeters: number[] | null;
  private readonly maxSpeedKph: number | null;
  private readonly onClamp: ((clamp: SensorSampleClamp) => void) | null;
  private readonly now: () => number;

  // Sensor position index (0-3) → participant, resolved by lane so a `lane swap`
  // reroutes ticks with it. The lane-map managed setting overrides the assumed
  // wiring; the recon probe confirms which jack is really which.
  private laneMap: (RaceParticipant | null)[] = [];
  // Last cumulative tick count seen per sensor, for per-sample deltas.
  private lastTicks: number[] = [];
  // Box elapsed time of the last sample seen, and of the last rotation emitted, per sensor.
  private lastElapsedMs: number[] = [];
  private lastEmittedElapsedMs: number[] = [];
  // Wall clock captured at GO; the box's elapsedMs is relative to this, and the
  // app's ActiveRace starts at the same moment, so timestamps line up.
  private goWallClockMs: number | null = null;

  constructor(options: OpenSprintsSessionOptions) {
    this.onRotation = options.onRotation;
    this.onLifecycle = options.onLifecycle;
    this.laneAssignments = options.laneAssignments ?? null;
    this.portRolloutMeters = options.portRolloutMeters ?? null;
    this.maxSpeedKph = options.maxSpeedKph ?? null;
    this.onClamp = options.onClamp ?? null;
    this.now = options.now ?? Date.now;
  }

  /**
   * Begin a race: map sensor positions to participants and reset tick baselines. The transport
   * sends the variant-specific arm commands itself (see `buildArmCommands`).
   */
  begin(participants: RaceParticipant[]): void {
    this.laneMap = this.buildLaneMap(participants);
    this.resetBaselines();
    this.goWallClockMs = null;
  }

  /**
   * Map each sensor port (index) to the participant on it. Every port resolves by lane — the
   * participant whose lane that port is wired to — so a `lane swap` reroutes the ticks with it and
   * a solo racer is heard on whichever bike they mounted. Unmapped/unused ports stay null. Without
   * a configured lane map the session assumes the conventional wiring
   * ({@link DEFAULT_SENSOR_LANE_ASSIGNMENTS}).
   */
  private buildLaneMap(participants: RaceParticipant[]): (RaceParticipant | null)[] {
    // An operator's own lane map is taken literally — it records where they put the ports, so a
    // `solo` entry in it still means what it always did. Only the assumed wiring reads a race
    // staged before the lane swap existed, whose lane:"solo" names no bike, as the left bike.
    const configured = this.laneAssignments != null;
    const assignments = this.laneAssignments ?? DEFAULT_SENSOR_LANE_ASSIGNMENTS;
    const laneOf = (participant: RaceParticipant): SensorLaneAssignment =>
      configured ? participant.lane : toBikeLane(participant.lane);

    return assignments.map((lane) => {
      if (!lane) {
        return null;
      }
      return participants.find((participant) => laneOf(participant) === lane) ?? null;
    });
  }

  /** End a race: reset translation state. The transport sends the stop command itself. */
  end(): void {
    this.laneMap = [];
    this.resetBaselines();
    this.goWallClockMs = null;
  }

  private resetBaselines(): void {
    this.lastTicks = [];
    this.lastElapsedMs = [];
    this.lastEmittedElapsedMs = [];
  }

  /** Feed one parsed message; emits rotation/lifecycle events as a side effect. */
  handleMessage(message: OpenSprintsMessage): void {
    switch (message.type) {
      case "countdown": {
        // CD:0 is the box's GO; positive values are countdown steps.
        if (message.value <= 0) {
          this.emitGo();
        } else {
          this.onLifecycle({ type: "countdown", secondsRemaining: message.value });
        }
        break;
      }
      case "progress": {
        // Progress only streams after the box's countdown, so the first one
        // confirms GO even if we never saw CD:0. Its elapsed time says how long ago that was.
        this.emitGo(message.elapsedMs);
        this.handleProgress(message.ticks, message.elapsedMs);
        break;
      }
      case "version":
      case "finish":
      case "falseStart":
      case "lengthAck":
      case "mockMode":
        // None of these carry anything the app needs in dumb-sensor mode.
        break;
    }
  }

  /** Record GO, `elapsedSinceGoMs` before now when inferred from a progress sample. */
  private emitGo(elapsedSinceGoMs = 0): void {
    if (this.goWallClockMs != null) {
      return;
    }
    this.goWallClockMs = this.now() - elapsedSinceGoMs;
    this.onLifecycle({ type: "go" });
  }

  private handleProgress(ticks: number[], elapsedMs: number): void {
    const timestampMs = (this.goWallClockMs ?? this.now()) + elapsedMs;
    for (let index = 0; index < ticks.length; index += 1) {
      const participant = this.laneMap[index];
      if (!participant) {
        continue;
      }
      const current = ticks[index];
      const previous = this.lastTicks[index] ?? 0;
      const previousElapsedMs = this.lastElapsedMs[index] ?? 0;
      this.lastTicks[index] = current;
      this.lastElapsedMs[index] = elapsedMs;
      // The box zeroes its counters at GO, so a lower value than last time means
      // a reset, not negative progress — treat the new value as the delta.
      const rawDelta = current >= previous ? current - previous : current;
      const delta = this.clampToCeiling(index, rawDelta, elapsedMs - previousElapsedMs);
      if (
        delta === 0 &&
        elapsedMs - (this.lastEmittedElapsedMs[index] ?? 0) < ZERO_SAMPLE_INTERVAL_MS
      ) {
        continue;
      }
      this.lastEmittedElapsedMs[index] = elapsedMs;
      const metersPerRotation = this.portRolloutMeters?.[index];
      this.onRotation({
        racerId: participant.racerId,
        lane: participant.lane,
        timestampMs,
        deltaRotations: delta,
        ...(metersPerRotation === undefined ? {} : { metersPerRotation })
      });
    }
  }

  /** Cut a tick jump down to what the plausible-speed ceiling allows across `intervalMs`. */
  private clampToCeiling(portIndex: number, rawTicks: number, intervalMs: number): number {
    const rollout = this.portRolloutMeters?.[portIndex];
    if (this.maxSpeedKph == null || rollout === undefined || intervalMs <= 0) {
      return rawTicks;
    }
    const keptTicks = ceilingTicks(this.maxSpeedKph, intervalMs, rollout);
    if (rawTicks <= keptTicks) {
      return rawTicks;
    }
    this.onClamp?.({ portIndex, rawTicks, keptTicks });
    return keptTicks;
  }
}
