/**
 * The admin sensor monitor's bookkeeping: what the race box is actually sending, independent of any
 * race. It sees every progress sample the transport decodes — during a race or a sensor test — and
 * keeps per-port tick totals, speeds, and the timing measurements that can't be read off the box
 * any other way (how long its silent countdown really is, and how far its start lands from the
 * app's GO). Pure bookkeeping with an injected clock, so the transport stays thin and tests are
 * deterministic.
 */

import type {
  SensorMonitor,
  SensorMonitorPort,
  RaceParticipant
} from "@roller-rumble/shared/types";
import { pushWindowPoint, windowRates, type WindowPoint } from "../services/metrics";
import {
  ceilingTicks,
  DEFAULT_SENSOR_LANE_ASSIGNMENTS,
  type SensorLaneAssignment
} from "./sensor-config";

/** The settings the monitor reads its numbers through, resolved by the transport per sample. */
export interface SensorMonitorConfig {
  /** The configured lane map, or null for the assumed wiring. */
  laneAssignments: SensorLaneAssignment[] | null;
  portRolloutMeters: number[];
  speedWindowMs: number;
  maxSpeedKph: number | null;
  boxCountdownMs: number;
}

const RECENT_LINE_LIMIT = 20;
/** A stream with no sample for this long is reported as not streaming. */
const STREAMING_STALE_MS = 1500;

interface PortState {
  ticks: number;
  lastSampleTicks: number;
  peakSampleSpeedKph: number;
  samplesOverCeiling: number;
  window: WindowPoint[];
}

function freshPort(): PortState {
  return {
    ticks: 0,
    lastSampleTicks: 0,
    peakSampleSpeedKph: 0,
    samplesOverCeiling: 0,
    window: [{ timestampMs: 0, distanceMeters: 0, rotationCount: 0 }]
  };
}

/** A port's meters per tick, falling back to port 0's for a port beyond the resolved list. */
function rolloutFor(config: SensorMonitorConfig, index: number): number {
  return config.portRolloutMeters.at(index) ?? config.portRolloutMeters.at(0) ?? 0;
}

function round(value: number, places = 2): number {
  return Number(value.toFixed(places));
}

export class SensorMonitorTracker {
  private readonly now: () => number;

  private mode: SensorMonitor["mode"] = "idle";
  private ports: PortState[] = [];
  private speedsKph: number[] = [];
  private sampleCount = 0;
  private lastElapsedMs: number | null = null;
  private lastIntervalMs: number | null = null;
  private lastSampleWallMs: number | null = null;
  private recentLines: string[] = [];

  // Timing of the current arm: when GO was sent, when the box actually started, and (for a race)
  // when the app's own GO fired. The two measurements below outlive the arm they came from.
  private armedAtMs: number | null = null;
  private boxGoAtMs: number | null = null;
  private appGoAtMs: number | null = null;
  private measuredBoxCountdownMs: number | null = null;
  private lastGoOffsetMs: number | null = null;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  /** GO was just sent to the box, for a race or a sensor test. Counting starts over. */
  noteArmed(mode: "testing" | "racing"): void {
    this.mode = mode;
    this.resetStream();
    this.armedAtMs = this.now();
    this.boxGoAtMs = null;
    this.appGoAtMs = null;
  }

  /** The app's own GO fired for a race; compared against the box's real start. */
  noteRaceGo(): void {
    this.appGoAtMs = this.now();
    this.measureGoOffset();
  }

  /** The box was told to stop. */
  noteStopped(): void {
    this.mode = "idle";
    this.armedAtMs = null;
  }

  noteLine(line: string): void {
    this.recentLines = [...this.recentLines, line].slice(-RECENT_LINE_LIMIT);
  }

  noteProgress(ticks: number[], elapsedMs: number, config: SensorMonitorConfig): void {
    const nowMs = this.now();
    // The box zeroes its counters (and its clock) on every GO; a clock that runs backwards means
    // it restarted, so start the tallies over rather than reading the drop as negative motion.
    if (this.lastElapsedMs != null && elapsedMs < this.lastElapsedMs) {
      this.resetStream();
    }
    if (this.boxGoAtMs == null) {
      this.boxGoAtMs = nowMs - elapsedMs;
      if (this.armedAtMs != null) {
        this.measuredBoxCountdownMs = Math.round(this.boxGoAtMs - this.armedAtMs);
      }
      this.measureGoOffset();
    }

    const intervalMs = elapsedMs - (this.lastElapsedMs ?? 0);
    ticks.forEach((cumulative, index) => {
      const port = (this.ports[index] ??= freshPort());
      const rollout = rolloutFor(config, index);
      const delta = Math.max(0, cumulative - port.ticks);
      if (intervalMs > 0) {
        const sampleKph = round(((delta * rollout) / intervalMs) * 1000 * 3.6);
        port.peakSampleSpeedKph = Math.max(port.peakSampleSpeedKph, sampleKph);
        if (
          config.maxSpeedKph != null &&
          delta > ceilingTicks(config.maxSpeedKph, intervalMs, rollout)
        ) {
          port.samplesOverCeiling += 1;
        }
      }
      port.ticks = cumulative;
      port.lastSampleTicks = delta;
      port.window = pushWindowPoint(
        port.window,
        { timestampMs: elapsedMs, distanceMeters: cumulative * rollout, rotationCount: cumulative },
        config.speedWindowMs
      );
      this.speedsKph[index] = round(windowRates(port.window).metersPerSecond * 3.6);
    });

    this.sampleCount += 1;
    this.lastIntervalMs = this.lastElapsedMs == null ? null : intervalMs;
    this.lastElapsedMs = elapsedMs;
    this.lastSampleWallMs = nowMs;
  }

  snapshot(
    identity: { adapterId: string; canTest: boolean; variant: string | null },
    config: SensorMonitorConfig
  ): SensorMonitor {
    const assignments = config.laneAssignments ?? DEFAULT_SENSOR_LANE_ASSIGNMENTS;
    const portCount = Math.max(this.ports.length, assignments.length);
    const ports: SensorMonitorPort[] = Array.from({ length: portCount }, (_, index) => {
      const port = this.ports[index] ?? freshPort();
      const metersPerTick = rolloutFor(config, index);
      const lane: RaceParticipant["lane"] | null = assignments[index] ?? null;
      return {
        index,
        lane,
        metersPerTick: round(metersPerTick, 4),
        ticks: port.ticks,
        lastSampleTicks: port.lastSampleTicks,
        distanceMeters: round(port.ticks * metersPerTick),
        speedKph: this.speedsKph[index] ?? 0,
        peakSampleSpeedKph: port.peakSampleSpeedKph,
        samplesOverCeiling: port.samplesOverCeiling
      };
    });

    return {
      ...identity,
      mode: this.mode,
      streaming:
        this.lastSampleWallMs != null && this.now() - this.lastSampleWallMs < STREAMING_STALE_MS,
      sampleCount: this.sampleCount,
      lastSampleElapsedMs: this.lastElapsedMs,
      lastSampleIntervalMs: this.lastIntervalMs,
      lastSampleAt:
        this.lastSampleWallMs == null ? null : new Date(this.lastSampleWallMs).toISOString(),
      measuredBoxCountdownMs: this.measuredBoxCountdownMs,
      configuredBoxCountdownMs: config.boxCountdownMs,
      lastGoOffsetMs: this.lastGoOffsetMs,
      maxSpeedKph: config.maxSpeedKph,
      speedWindowMs: config.speedWindowMs,
      ports,
      recentLines: this.recentLines
    };
  }

  private measureGoOffset(): void {
    if (this.mode === "racing" && this.boxGoAtMs != null && this.appGoAtMs != null) {
      this.lastGoOffsetMs = Math.round(this.boxGoAtMs - this.appGoAtMs);
    }
  }

  private resetStream(): void {
    this.ports = [];
    this.speedsKph = [];
    this.sampleCount = 0;
    this.lastElapsedMs = null;
    this.lastIntervalMs = null;
  }
}
