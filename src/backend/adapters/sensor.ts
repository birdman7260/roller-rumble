import type { RaceParticipant } from "../../shared/types";

export interface RotationEvent {
  lane: RaceParticipant["lane"];
  racerId: string;
  timestampMs: number;
  deltaRotations: number;
}

export type RotationListener = (event: RotationEvent) => void;

export interface SensorAdapter {
  id: string;
  label: string;
  connect(listener: RotationListener): Promise<void> | void;
  disconnect(): Promise<void> | void;
  beginRace(participants: RaceParticipant[]): void;
  endRace(): void;
}
