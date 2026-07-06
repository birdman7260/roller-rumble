import { DEFAULT_WHEEL_CIRCUMFERENCE_METERS } from "@roller-rumble/shared/constants";
import type { RaceMetricsSnapshot, RaceParticipant } from "@roller-rumble/shared/types";

export interface RotationSample {
  timestampMs: number;
  deltaRotations: number;
}

export interface LaneTelemetryState {
  participant: RaceParticipant;
  startedAtMs: number;
  lastSampleAtMs: number;
  snapshot: RaceMetricsSnapshot;
}

export function createLaneTelemetryState(
  participant: RaceParticipant,
  startedAtMs: number
): LaneTelemetryState {
  return {
    participant,
    startedAtMs,
    lastSampleAtMs: startedAtMs,
    snapshot: {
      racerId: participant.racerId,
      lane: participant.lane,
      rotationCount: 0,
      elapsedMs: 0,
      distanceMeters: 0,
      rpm: 0,
      currentSpeedKph: 0,
      topSpeedKph: 0,
      averageSpeedKph: 0,
      wattage: 0,
      maxWattage: 0,
      finishedAtMs: null
    }
  };
}

export function estimateWattage(speedKph: number): number {
  const speedMps = speedKph / 3.6;
  return Number(Math.max(0, 12 + 18 * speedMps + 1.8 * speedMps ** 3).toFixed(2));
}

export function applyRotationSample(
  state: LaneTelemetryState,
  sample: RotationSample,
  wheelCircumferenceMeters = DEFAULT_WHEEL_CIRCUMFERENCE_METERS
): LaneTelemetryState {
  const elapsedMs = Math.max(0, sample.timestampMs - state.startedAtMs);
  const deltaTimeMs = Math.max(1, sample.timestampMs - state.lastSampleAtMs);
  const deltaDistanceMeters = sample.deltaRotations * wheelCircumferenceMeters;
  const totalDistanceMeters = state.snapshot.distanceMeters + deltaDistanceMeters;
  const currentSpeedKph = Number(((deltaDistanceMeters / deltaTimeMs) * 1000 * 3.6).toFixed(2));
  const rpm = Number(((sample.deltaRotations / deltaTimeMs) * 60000).toFixed(2));
  const averageSpeedKph =
    elapsedMs === 0 ? 0 : Number(((totalDistanceMeters / elapsedMs) * 1000 * 3.6).toFixed(2));
  const wattage = estimateWattage(currentSpeedKph);

  return {
    ...state,
    lastSampleAtMs: sample.timestampMs,
    snapshot: {
      ...state.snapshot,
      rotationCount: state.snapshot.rotationCount + sample.deltaRotations,
      elapsedMs,
      distanceMeters: Number(totalDistanceMeters.toFixed(2)),
      rpm,
      currentSpeedKph,
      topSpeedKph: Math.max(state.snapshot.topSpeedKph, currentSpeedKph),
      averageSpeedKph,
      wattage,
      maxWattage: Math.max(state.snapshot.maxWattage, wattage)
    }
  };
}

export function finishLaneTelemetryState(
  state: LaneTelemetryState,
  finishedAtMs: number
): LaneTelemetryState {
  return {
    ...state,
    lastSampleAtMs: finishedAtMs,
    snapshot: {
      ...state.snapshot,
      elapsedMs: Math.max(0, finishedAtMs - state.startedAtMs),
      rpm: 0,
      currentSpeedKph: 0,
      wattage: 0,
      finishedAtMs: Math.max(0, finishedAtMs - state.startedAtMs)
    }
  };
}
