import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RaceRecord } from "@roller-rumble/shared/types";
import { ActiveRace } from "./active-race";
import type { AppDatabase } from "../db/Database";
import type { SensorAdapter } from "../adapters/sensor";

function makeRace(patch: Partial<RaceRecord> = {}): RaceRecord {
  return {
    id: "race-1",
    eventId: "event-1",
    queueEntryId: "queue-1",
    mode: "open-time-trial",
    format: "match",
    state: "countdown",
    targetDistanceMeters: 250,
    themeId: "theme-1",
    participants: [
      { racerId: "r1", lane: "left" },
      { racerId: "r2", lane: "right" }
    ],
    metrics: [],
    winnerRacerId: null,
    countdownStartedAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...patch
  };
}

function makeDb(initialRace: RaceRecord) {
  let currentRace = initialRace;

  const updateRace = vi.fn((raceId: string, patch: Partial<RaceRecord>) => {
    currentRace = { ...currentRace, ...patch };
    return currentRace;
  });
  const markQueueEntryStatus = vi.fn();
  const createResults = vi.fn();

  return { updateRace, markQueueEntryStatus, createResults };
}

function makeSensor() {
  return {
    id: "mock",
    label: "Mock",
    connect: vi.fn(),
    disconnect: vi.fn(),
    beginRace: vi.fn(),
    endRace: vi.fn()
  } as unknown as SensorAdapter;
}

function asAppDatabase(db: ReturnType<typeof makeDb>): AppDatabase {
  return db as unknown as AppDatabase;
}

describe("ActiveRace", () => {
  let db: ReturnType<typeof makeDb>;
  let sensor: SensorAdapter;
  let race: RaceRecord;

  beforeEach(() => {
    race = makeRace();
    db = makeDb(race);
    sensor = makeSensor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("start() transitions the race to active in the DB with startedAt", () => {
    const onFinalized = vi.fn();

    ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    expect(db.updateRace).toHaveBeenCalledWith(
      "race-1",
      expect.objectContaining({
        state: "active"
      })
    );
    expect(db.updateRace.mock.calls[0][1].startedAt).toBeTruthy();
  });

  it("start() arms the sensor with participants", () => {
    const onFinalized = vi.fn();

    ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    expect(sensor.beginRace).toHaveBeenCalledWith(race.participants);
  });

  it("start() marks the queue entry as racing", () => {
    const onFinalized = vi.fn();

    ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    expect(db.markQueueEntryStatus).toHaveBeenCalledWith("queue-1", "racing");
  });

  it("tick() updates lane metrics in the DB after one sample", () => {
    const onFinalized = vi.fn();
    const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    db.updateRace.mockClear();

    activeRace.tick("r1", 1000, 5);

    expect(db.updateRace).toHaveBeenCalled();
    const [, patch] = db.updateRace.mock.calls[0];
    expect(patch.metrics).toBeDefined();
    expect(patch.metrics?.length).toBeGreaterThan(0);
  });

  it("tick() accumulates distance across multiple samples for the same racer", () => {
    const onFinalized = vi.fn();
    const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    db.updateRace.mockClear();

    activeRace.tick("r1", 1000, 5);
    const firstMetrics = db.updateRace.mock.calls[0][1].metrics as { distanceMeters: number }[];
    const firstDistance = firstMetrics[0].distanceMeters;

    db.updateRace.mockClear();

    activeRace.tick("r1", 2000, 3);
    const secondMetrics = db.updateRace.mock.calls[0][1].metrics as { distanceMeters: number }[];
    const secondDistance = secondMetrics[0].distanceMeters;

    expect(secondDistance).toBeGreaterThan(firstDistance);
  });

  it("finalize() calls onFinalized with the finalized race and winner", () => {
    const onFinalized = vi.fn();
    const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    activeRace.finalize();

    expect(onFinalized).toHaveBeenCalledWith(
      expect.objectContaining({
        race: expect.objectContaining({ state: "finished" }) as unknown,
        winnerRacerId: expect.any(String) as unknown
      })
    );
  });

  it("finalize() ends the sensor", () => {
    const onFinalized = vi.fn();
    const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    activeRace.finalize();

    expect(sensor.endRace).toHaveBeenCalled();
  });

  it("finalize() marks the queue entry as completed", () => {
    const onFinalized = vi.fn();
    const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    activeRace.finalize();

    expect(db.markQueueEntryStatus).toHaveBeenCalledWith("queue-1", "completed");
  });

  it("finalize() persists results with correct placement", () => {
    const onFinalized = vi.fn();
    const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    activeRace.tick("r1", 1000, 100);
    activeRace.tick("r2", 1100, 50);

    activeRace.finalize();

    expect(db.createResults).toHaveBeenCalled();
    const results = db.createResults.mock.calls[0][0] as { racerId: string; placement: number }[];
    const r1Result = results.find((r) => r.racerId === "r1");
    const r2Result = results.find((r) => r.racerId === "r2");
    expect(r1Result?.placement).toBe(1);
    expect(r2Result?.placement).toBe(2);
  });

  it("finalize() is idempotent — second call fires onFinalized only once", () => {
    const onFinalized = vi.fn();
    const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

    activeRace.finalize();
    activeRace.finalize();

    expect(onFinalized).toHaveBeenCalledTimes(1);
  });

  it("fires onFinalized after 1500ms grace period when a lane reaches target", () => {
    vi.useFakeTimers();
    try {
      const onFinalized = vi.fn();
      const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

      activeRace.tick("r1", 1000, 100); // 210m
      activeRace.tick("r1", 2000, 20); // 252m (crosses)

      expect(onFinalized).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1500);

      expect(onFinalized).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes the other lane's one last sample before onFinalized fires", () => {
    vi.useFakeTimers();
    try {
      const onFinalized = vi.fn();
      const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

      activeRace.tick("r1", 1000, 100); // 210m
      activeRace.tick("r1", 2000, 20); // 252m (crosses)

      expect(onFinalized).not.toHaveBeenCalled();

      activeRace.tick("r2", 2100, 15);

      vi.advanceTimersByTime(1500);

      expect(onFinalized).toHaveBeenCalled();
      const finalRace = (onFinalized.mock.calls[0][0] as { race: RaceRecord }).race;
      const r2Metric = finalRace.metrics.find((m) => m.racerId === "r2");
      expect(r2Metric).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("first lane to cross is the winner even if the other crosses during grace window", () => {
    vi.useFakeTimers();
    try {
      const onFinalized = vi.fn();
      const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

      activeRace.tick("r1", 1000, 100); // 210m
      activeRace.tick("r1", 2000, 20); // 252m (crosses, becomes winner)

      activeRace.tick("r2", 2100, 100);

      vi.advanceTimersByTime(1500);

      const finalResult = onFinalized.mock.calls[0][0] as { winnerRacerId: string | null };
      expect(finalResult.winnerRacerId).toBe("r1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispose() prevents the grace timer from firing", () => {
    vi.useFakeTimers();
    try {
      const onFinalized = vi.fn();
      const activeRace = ActiveRace.start(race, asAppDatabase(db), sensor, onFinalized);

      activeRace.tick("r1", 1000, 100);
      activeRace.tick("r1", 2000, 20);

      expect(onFinalized).not.toHaveBeenCalled();

      activeRace.dispose();

      vi.advanceTimersByTime(1500);

      expect(onFinalized).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resume() starts from persisted metrics, not zero", () => {
    const existingMetrics = [
      {
        racerId: "r1",
        lane: "left" as const,
        rotationCount: 50,
        elapsedMs: 1000,
        distanceMeters: 105,
        currentSpeedKph: 30,
        topSpeedKph: 35,
        averageSpeedKph: 31.5,
        wattage: 100,
        maxWattage: 120,
        finishedAtMs: null
      }
    ];

    const raceWithMetrics = makeRace({
      state: "active",
      startedAt: "2026-01-01T00:00:01Z",
      metrics: existingMetrics
    });

    db = makeDb(raceWithMetrics);
    const onFinalized = vi.fn();

    const _activeRace = ActiveRace.resume(raceWithMetrics, asAppDatabase(db), sensor, onFinalized);

    expect(sensor.beginRace).toHaveBeenCalledWith(raceWithMetrics.participants);

    expect(db.updateRace).toHaveBeenCalledWith(
      "race-1",
      expect.objectContaining({
        state: "active"
      })
    );
  });

  it("resume().finalize() immediately finalizes an interrupted race using stored metrics", () => {
    const existingMetrics = [
      {
        racerId: "r1",
        lane: "left" as const,
        rotationCount: 50,
        elapsedMs: 1000,
        distanceMeters: 105,
        currentSpeedKph: 30,
        topSpeedKph: 35,
        averageSpeedKph: 31.5,
        wattage: 100,
        maxWattage: 120,
        finishedAtMs: null
      },
      {
        racerId: "r2",
        lane: "right" as const,
        rotationCount: 40,
        elapsedMs: 1000,
        distanceMeters: 84,
        currentSpeedKph: 25,
        topSpeedKph: 28,
        averageSpeedKph: 25.2,
        wattage: 80,
        maxWattage: 90,
        finishedAtMs: null
      }
    ];

    const raceWithMetrics = makeRace({
      state: "active",
      startedAt: "2026-01-01T00:00:01Z",
      metrics: existingMetrics
    });

    db = makeDb(raceWithMetrics);
    const onFinalized = vi.fn();

    const activeRace = ActiveRace.resume(raceWithMetrics, asAppDatabase(db), sensor, onFinalized);
    activeRace.finalize();

    expect(onFinalized).toHaveBeenCalled();
    const finalResult = onFinalized.mock.calls[0][0] as {
      race: RaceRecord;
      winnerRacerId: string | null;
    };
    expect(finalResult.race.state).toBe("finished");
    expect(finalResult.winnerRacerId).toBe("r1");
  });
});
