import type { RaceRecord } from "@roller-rumble/shared/types";
import { nowIso } from "@roller-rumble/shared/utils";
import type { AppDatabase } from "../db/Database";
import type { SensorAdapter } from "../adapters/sensor";
import {
  createLaneTelemetryState,
  applyRotationSample,
  finishLaneTelemetryState,
  type LaneTelemetryState
} from "./metrics";

export interface FinalizedRaceResult {
  race: RaceRecord;
  winnerRacerId: string | null;
}

export class ActiveRace {
  private raceId: string;
  private queueEntryId: string | null;
  private targetDistanceMeters: number;
  private laneStates: Map<string, LaneTelemetryState>;
  private winnerRacerId: string | null = null;
  private finished = false;
  private finalizeTimer: NodeJS.Timeout | null = null;
  private startedAtMs: number;
  private db: AppDatabase;
  private sensor: SensorAdapter;
  private onFinalized: (result: FinalizedRaceResult) => void;

  private constructor(
    race: RaceRecord,
    db: AppDatabase,
    sensor: SensorAdapter,
    onFinalized: (result: FinalizedRaceResult) => void,
    isResume = false
  ) {
    this.raceId = race.id;
    this.queueEntryId = race.queueEntryId;
    this.targetDistanceMeters = race.targetDistanceMeters;
    this.db = db;
    this.sensor = sensor;
    this.onFinalized = onFinalized;
    this.startedAtMs = race.startedAt ? new Date(race.startedAt).getTime() : Date.now();

    // Initialize lane states
    if (isResume && race.metrics.length > 0) {
      // Resume from existing metrics
      this.laneStates = new Map(
        race.participants.map((participant) => [
          participant.racerId,
          {
            participant,
            startedAtMs: this.startedAtMs,
            lastSampleAtMs: this.startedAtMs,
            snapshot:
              race.metrics.find((metric) => metric.racerId === participant.racerId) ??
              createLaneTelemetryState(participant, this.startedAtMs).snapshot
          }
        ])
      );
      this.winnerRacerId =
        race.winnerRacerId ??
        (race.metrics.length > 0
          ? race.metrics.sort((left, right) => right.distanceMeters - left.distanceMeters)[0]
              .racerId
          : null) ??
        null;
    } else {
      // Start fresh
      this.laneStates = new Map(
        race.participants.map((participant) => [
          participant.racerId,
          createLaneTelemetryState(participant, this.startedAtMs)
        ])
      );
    }
  }

  static start(
    race: RaceRecord,
    db: AppDatabase,
    sensor: SensorAdapter,
    onFinalized: (result: FinalizedRaceResult) => void
  ): ActiveRace {
    const activeRace = new ActiveRace(race, db, sensor, onFinalized, false);

    // Transition race to active
    const startedAt = nowIso();
    db.updateRace(race.id, {
      state: "active",
      startedAt
    });

    // Arm the sensor
    sensor.beginRace(race.participants);

    // Mark queue entry as racing
    if (race.queueEntryId) {
      db.markQueueEntryStatus(race.queueEntryId, "racing");
    }

    return activeRace;
  }

  static resume(
    race: RaceRecord,
    db: AppDatabase,
    sensor: SensorAdapter,
    onFinalized: (result: FinalizedRaceResult) => void
  ): ActiveRace {
    const activeRace = new ActiveRace(race, db, sensor, onFinalized, true);

    // Arm the sensor
    sensor.beginRace(race.participants);

    // Mark race as active if not already
    db.updateRace(race.id, {
      state: "active",
      startedAt: race.startedAt ?? nowIso()
    });

    return activeRace;
  }

  tick(racerId: string, timestampMs: number, deltaRotations: number): void {
    if (this.finished) {
      return;
    }

    const laneState = this.laneStates.get(racerId);
    if (!laneState) {
      return;
    }

    const next = applyRotationSample(laneState, {
      timestampMs,
      deltaRotations
    });

    this.laneStates.set(racerId, next);

    // Check if this lane just crossed the finish line
    const justFinished =
      next.snapshot.finishedAtMs == null &&
      next.snapshot.distanceMeters >= this.targetDistanceMeters;

    if (justFinished) {
      const finishedState = finishLaneTelemetryState(next, timestampMs);
      this.laneStates.set(racerId, finishedState);
      this.winnerRacerId ??= racerId;
      // Allow a short grace period so the other lane can contribute one last sample
      this.finalizeTimer ??= setTimeout(() => this.finalize(), 1500);
    }

    // Update DB with current metrics
    const metrics = [...this.laneStates.values()].map((state) => state.snapshot);
    this.db.updateRace(this.raceId, {
      metrics,
      winnerRacerId: this.winnerRacerId
    });
  }

  finalize(): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    if (this.finalizeTimer) {
      clearTimeout(this.finalizeTimer);
      this.finalizeTimer = null;
    }

    this.sensor.endRace();

    if (this.queueEntryId) {
      this.db.markQueueEntryStatus(this.queueEntryId, "completed");
    }

    // Finalize any lanes that haven't finished yet
    const finalizedMetrics = [...this.laneStates.values()].map((state) => {
      if (state.snapshot.finishedAtMs != null) {
        return state.snapshot;
      }
      return finishLaneTelemetryState(state, Date.now()).snapshot;
    });

    // Sort by finish time, then by distance
    const ordered = [...finalizedMetrics].sort((left, right) => {
      const leftTime = left.finishedAtMs ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.finishedAtMs ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return right.distanceMeters - left.distanceMeters;
    });

    const winnerRacerId = this.winnerRacerId ?? (ordered.length > 0 ? ordered[0].racerId : null);

    // Update race to finished state
    const finishedRace = this.db.updateRace(this.raceId, {
      state: "finished",
      metrics: finalizedMetrics,
      winnerRacerId,
      finishedAt: nowIso()
    });

    // Create results with proper placement
    this.db.createResults(
      ordered.map((metric, index) => ({
        eventId: finishedRace.eventId,
        raceId: finishedRace.id,
        racerId: metric.racerId,
        lane: metric.lane,
        placement: index + 1,
        finishTimeMs: metric.finishedAtMs ?? metric.elapsedMs,
        distanceMeters: metric.distanceMeters,
        avgSpeedKph: metric.averageSpeedKph,
        topSpeedKph: metric.topSpeedKph,
        maxWattage: metric.maxWattage
      }))
    );

    // Fire the callback
    this.onFinalized({
      race: finishedRace,
      winnerRacerId
    });
  }

  dispose(): void {
    if (this.finalizeTimer) {
      clearTimeout(this.finalizeTimer);
      this.finalizeTimer = null;
    }
  }
}
