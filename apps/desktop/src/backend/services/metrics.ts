import { DEFAULT_WHEEL_CIRCUMFERENCE_METERS } from "@roller-rumble/shared/constants";
import type { RaceMetricsSnapshot, RaceParticipant } from "@roller-rumble/shared/types";
import { DEFAULT_WATTAGE_MODEL, type WattageModel } from "./metrics-tuning";

export interface RotationSample {
  timestampMs: number;
  deltaRotations: number;
}

/** A lane's running totals at one sample, kept so speed can be averaged over a trailing window. */
export interface WindowPoint {
  timestampMs: number;
  distanceMeters: number;
  rotationCount: number;
}

export interface LaneTelemetryState {
  participant: RaceParticipant;
  startedAtMs: number;
  lastSampleAtMs: number;
  snapshot: RaceMetricsSnapshot;
  /**
   * The recent samples live speed is averaged over: the oldest point is the window's anchor. Absent
   * on a state built before the first sample, in which case the anchor is the last sample itself.
   */
  window?: WindowPoint[];
}

/** How rotation samples turn into the live numbers; see `metrics-tuning.ts` for the readers. */
export interface MetricsTuning {
  /** Trailing window live speed and cadence are averaged over; 0 means each sample alone. */
  speedWindowMs: number;
  wattage?: WattageModel;
}

const PER_SAMPLE_TUNING: MetricsTuning = { speedWindowMs: 0 };

/**
 * Append `point` and drop everything the window no longer needs. The anchor is the newest earlier
 * point at or before `point − windowMs` — or the oldest point when the window reaches further back
 * than the history — so a zero window anchors on the previous sample (per-sample speed).
 */
export function pushWindowPoint(
  window: readonly WindowPoint[],
  point: WindowPoint,
  windowMs: number
): WindowPoint[] {
  const cutoff = point.timestampMs - windowMs;
  let anchor = 0;
  for (let index = 0; index < window.length; index += 1) {
    if (window[index].timestampMs <= cutoff) {
      anchor = index;
    }
  }
  return [...window.slice(anchor), point];
}

/** Speed (m/s) and cadence (rpm) across a window, from its anchor to its newest point. */
export function windowRates(window: readonly WindowPoint[]): {
  metersPerSecond: number;
  rotationsPerMinute: number;
} {
  if (window.length < 2) {
    return { metersPerSecond: 0, rotationsPerMinute: 0 };
  }
  const first = window[0];
  const last = window[window.length - 1];
  const deltaTimeMs = Math.max(1, last.timestampMs - first.timestampMs);
  return {
    metersPerSecond: ((last.distanceMeters - first.distanceMeters) / deltaTimeMs) * 1000,
    rotationsPerMinute: ((last.rotationCount - first.rotationCount) / deltaTimeMs) * 60000
  };
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

export function estimateWattage(speedKph: number, model = DEFAULT_WATTAGE_MODEL): number {
  const speedMps = speedKph / 3.6;
  if (speedMps <= 0) {
    return 0;
  }
  return Number(
    Math.max(0, model.baseWatts + model.linear * speedMps + model.cubic * speedMps ** 3).toFixed(2)
  );
}

export function applyRotationSample(
  state: LaneTelemetryState,
  sample: RotationSample,
  wheelCircumferenceMeters = DEFAULT_WHEEL_CIRCUMFERENCE_METERS,
  tuning: MetricsTuning = PER_SAMPLE_TUNING
): LaneTelemetryState {
  const elapsedMs = Math.max(0, sample.timestampMs - state.startedAtMs);
  const deltaDistanceMeters = sample.deltaRotations * wheelCircumferenceMeters;
  const totalDistanceMeters = state.snapshot.distanceMeters + deltaDistanceMeters;
  const rotationCount = state.snapshot.rotationCount + sample.deltaRotations;
  const previous: WindowPoint = {
    timestampMs: state.lastSampleAtMs,
    distanceMeters: state.snapshot.distanceMeters,
    rotationCount: state.snapshot.rotationCount
  };
  const window = pushWindowPoint(
    state.window ?? [previous],
    { timestampMs: sample.timestampMs, distanceMeters: totalDistanceMeters, rotationCount },
    Math.max(0, tuning.speedWindowMs)
  );
  const rates = windowRates(window);
  const currentSpeedKph = Number((rates.metersPerSecond * 3.6).toFixed(2));
  const rpm = Number(rates.rotationsPerMinute.toFixed(2));
  const averageSpeedKph =
    elapsedMs === 0 ? 0 : Number(((totalDistanceMeters / elapsedMs) * 1000 * 3.6).toFixed(2));
  const wattage = estimateWattage(currentSpeedKph, tuning.wattage);

  return {
    ...state,
    lastSampleAtMs: sample.timestampMs,
    window,
    snapshot: {
      ...state.snapshot,
      rotationCount,
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
