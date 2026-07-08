import type { RaceRecord } from "@roller-rumble/shared/types";
import {
  DEFAULT_WHEEL_CIRCUMFERENCE_METERS,
  RACE_CLEAN_FINISH_BEAT_MS
} from "@roller-rumble/shared/constants";
import { nowIso } from "@roller-rumble/shared/utils";
import type { AppDatabase } from "../db/Database";
import type { SensorAdapter } from "../adapters/sensor";
import {
  createLaneTelemetryState,
  applyRotationSample,
  finishLaneTelemetryState,
  type LaneTelemetryState
} from "./metrics";
import { finishBudgetDeadlineMs, readFinishBudgetPercent } from "./finish-budget";

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
  private wheelCircumferenceMeters: number;
  private finishBudgetPercent: number;
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
    this.queueEntryId = race.queueEntryId ?? null;
    this.targetDistanceMeters = race.targetDistanceMeters;
    this.db = db;
    this.sensor = sensor;
    this.onFinalized = onFinalized;
    // The rollout is fixed for the life of a race: capture it once at start rather than re-reading
    // the setting per tick, so an operator edit only affects the next race.
    this.wheelCircumferenceMeters =
      sensor.wheelCircumferenceMeters ?? DEFAULT_WHEEL_CIRCUMFERENCE_METERS;
    // The finish budget percentage is likewise fixed for the life of a race: capture it once so an
    // operator edit only affects the next race, not one already underway.
    this.finishBudgetPercent = readFinishBudgetPercent();
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

    // Finish freeze: once a lane crosses the line it stops reporting live metrics. Applying another
    // rotation sample would overwrite its settled zero speed/cadence/wattage with fresh motion,
    // which looks wrong on the projector while the trailing racer is still riding to the line.
    if (laneState.snapshot.finishedAtMs != null) {
      return;
    }

    const next = applyRotationSample(
      laneState,
      {
        timestampMs,
        deltaRotations
      },
      this.wheelCircumferenceMeters
    );

    this.laneStates.set(racerId, next);

    // Check if this lane just crossed the finish line
    const justFinished =
      next.snapshot.finishedAtMs == null &&
      next.snapshot.distanceMeters >= this.targetDistanceMeters;

    if (justFinished) {
      const finishedState = finishLaneTelemetryState(next, timestampMs);
      this.laneStates.set(racerId, finishedState);
      this.winnerRacerId ??= racerId;
      this.scheduleFinalizeAfterFinish();
    }

    // Update DB with current metrics
    const metrics = [...this.laneStates.values()].map((state) => state.snapshot);
    this.db.updateRace(this.raceId, {
      metrics,
      winnerRacerId: this.winnerRacerId
    });
  }

  /**
   * Decide when to finalize now that a lane has crossed the line. When every lane has finished —
   * both racers in a match, or the lone rider in a solo race — give the audience a short beat on the
   * finish line, then finalize. When one lane is still riding, hand the trailing racer their finish
   * budget and force-finalize when it expires. The budget is enforced by a wall-clock timer because
   * a rider who stops pedaling sends no more ticks for the deadline to be checked against.
   */
  private scheduleFinalizeAfterFinish(): void {
    if (this.allLanesFinished()) {
      this.armFinalize(RACE_CLEAN_FINISH_BEAT_MS);
      return;
    }

    const winnerElapsedMs = this.winnerElapsedMs();
    const deadlineMs = finishBudgetDeadlineMs(winnerElapsedMs, this.finishBudgetPercent);
    this.armFinalize(deadlineMs - winnerElapsedMs);
  }

  private allLanesFinished(): boolean {
    return [...this.laneStates.values()].every((state) => state.snapshot.finishedAtMs != null);
  }

  /** The winner's elapsed time at their finish. `finishedAtMs` is stored relative to race start. */
  private winnerElapsedMs(): number {
    const winner = this.winnerRacerId ? this.laneStates.get(this.winnerRacerId) : null;
    return winner?.snapshot.finishedAtMs ?? 0;
  }

  /** (Re)arm the single finalize timer, replacing any pending one (e.g. a budget timer superseded
   * by a clean finish once the trailing racer also crosses). */
  private armFinalize(delayMs: number): void {
    if (this.finalizeTimer) {
      clearTimeout(this.finalizeTimer);
    }
    this.finalizeTimer = setTimeout(() => this.finalize(), Math.max(0, delayMs));
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
