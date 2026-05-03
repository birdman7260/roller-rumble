import type { RaceParticipant } from "../../shared/types";
import type { RotationEvent, RotationListener, SensorAdapter } from "./sensor";

interface LaneProfile {
  racerId: string;
  lane: RaceParticipant["lane"];
  cadenceRpm: number;
  fractionalRotations: number;
}

export class SimulatorSensorAdapter implements SensorAdapter {
  readonly id = "simulator";
  readonly label = "Built-in simulator";

  private listener: RotationListener | null = null;
  private timer: NodeJS.Timeout | null = null;
  private profiles: LaneProfile[] = [];

  connect(listener: RotationListener): void {
    this.listener = listener;
  }

  disconnect(): void {
    this.endRace();
    this.listener = null;
  }

  beginRace(participants: RaceParticipant[]): void {
    this.endRace();
    this.profiles = participants.map((participant, index) => ({
      racerId: participant.racerId,
      lane: participant.lane,
      cadenceRpm: 84 + index * 6 + Math.random() * 12,
      fractionalRotations: 0
    }));

    this.timer = setInterval(() => {
      const timestampMs = Date.now();
      for (const profile of this.profiles) {
        profile.cadenceRpm += (Math.random() - 0.5) * 6;
        profile.cadenceRpm = Math.max(64, Math.min(132, profile.cadenceRpm));

        const rotationsPerTick = (profile.cadenceRpm / 60) * 0.25;
        const total = profile.fractionalRotations + rotationsPerTick;
        const wholeRotations = Math.floor(total);
        profile.fractionalRotations = total - wholeRotations;

        if (wholeRotations > 0) {
          this.emit({
            racerId: profile.racerId,
            lane: profile.lane,
            timestampMs,
            deltaRotations: wholeRotations
          });
        }
      }
    }, 250);
  }

  endRace(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.profiles = [];
  }

  private emit(event: RotationEvent): void {
    this.listener?.(event);
  }
}
