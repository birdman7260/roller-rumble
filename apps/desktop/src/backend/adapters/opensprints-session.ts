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

export interface OpenSprintsSessionOptions {
  onRotation: (event: RotationEvent) => void;
  onLifecycle: (event: SensorLifecycleEvent) => void;
  /**
   * Which race lane each sensor port (by index) feeds. When omitted, `begin` falls back to a
   * positional map (sensor i → participants[i]); when present, each participant is matched to the
   * sensor port configured for its lane, so the box's fixed port order can't crown the wrong racer.
   */
  laneAssignments?: SensorLaneAssignment[];
  /** Injectable wall clock (defaults to Date.now) so tests are deterministic. */
  now?: () => number;
}

export class OpenSprintsSession {
  private readonly onRotation: (event: RotationEvent) => void;
  private readonly onLifecycle: (event: SensorLifecycleEvent) => void;
  private readonly laneAssignments: SensorLaneAssignment[] | null;
  private readonly now: () => number;

  // Sensor position index (0-3) → participant. Positional by default: the box's
  // first reported sensor maps to the first participant. The future lane-map
  // managed setting refines this; the recon probe confirms the real wiring.
  private laneMap: (RaceParticipant | null)[] = [];
  // Last cumulative tick count seen per sensor, for per-sample deltas.
  private lastTicks: number[] = [];
  // Wall clock captured at GO; the box's elapsedMs is relative to this, and the
  // app's ActiveRace starts at the same moment, so timestamps line up.
  private goWallClockMs: number | null = null;

  constructor(options: OpenSprintsSessionOptions) {
    this.onRotation = options.onRotation;
    this.onLifecycle = options.onLifecycle;
    this.laneAssignments = options.laneAssignments ?? null;
    this.now = options.now ?? Date.now;
  }

  /**
   * Begin a race: map sensor positions to participants and reset tick baselines. The transport
   * sends the variant-specific arm commands itself (see `buildArmCommands`).
   */
  begin(participants: RaceParticipant[]): void {
    this.laneMap = this.buildLaneMap(participants);
    this.lastTicks = [];
    this.goWallClockMs = null;
  }

  /**
   * Map each sensor port (index) to the participant on it. With a configured lane map each port
   * resolves to the participant whose lane it is wired to (unmapped/unused ports stay null);
   * without one, ports map positionally to participants in order.
   */
  private buildLaneMap(participants: RaceParticipant[]): (RaceParticipant | null)[] {
    if (!this.laneAssignments) {
      return participants.map((participant) => participant);
    }
    return this.laneAssignments.map((lane) => {
      if (!lane) {
        return null;
      }
      return participants.find((participant) => participant.lane === lane) ?? null;
    });
  }

  /** End a race: reset translation state. The transport sends the stop command itself. */
  end(): void {
    this.laneMap = [];
    this.lastTicks = [];
    this.goWallClockMs = null;
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
        // confirms GO even if we never saw CD:0.
        this.emitGo();
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

  private emitGo(): void {
    if (this.goWallClockMs != null) {
      return;
    }
    this.goWallClockMs = this.now();
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
      this.lastTicks[index] = current;
      // The box zeroes its counters at GO, so a lower value than last time means
      // a reset, not negative progress — treat the new value as the delta.
      const delta = current >= previous ? current - previous : current;
      if (delta > 0) {
        this.onRotation({
          racerId: participant.racerId,
          lane: participant.lane,
          timestampMs,
          deltaRotations: delta
        });
      }
    }
  }
}
