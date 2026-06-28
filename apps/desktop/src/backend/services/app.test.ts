import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSettings, AppSnapshot, RaceRecord } from "@roller-rumble/shared/types";
import type { SensorLifecycleEvent, SensorStatus } from "../adapters/sensor";
import { RollerRumbleApp } from "./app";

type LifecycleInvoker = (this: unknown, event: SensorLifecycleEvent) => void;
type StatusChangeInvoker = (this: unknown, status: SensorStatus) => void;

function getLifecycleInvoker(): LifecycleInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "handleSensorLifecycle");
  if (typeof candidate !== "function") {
    throw new Error("Missing handleSensorLifecycle implementation");
  }

  return candidate as LifecycleInvoker;
}

function getStatusChangeInvoker(): StatusChangeInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "handleSensorStatusChange");
  if (typeof candidate !== "function") {
    throw new Error("Missing handleSensorStatusChange implementation");
  }

  return candidate as StatusChangeInvoker;
}

function buildSensorStatus(patch: Partial<SensorStatus> = {}): SensorStatus {
  return {
    adapterId: "opensprints",
    label: "OpenSprints USB box",
    connected: true,
    detail: "Connected.",
    portPath: "/dev/ttyBox",
    firmware: "SS_v0.1.7",
    manualPortOverride: null,
    lastError: null,
    ...patch
  };
}

type CountdownInvoker = (
  this: unknown,
  source: "manual" | "os2l",
  options?: { countdownDurationMs?: number }
) => AppSnapshot;
type AutoStageInvoker = (this: unknown) => boolean;
type ClearResultPresentationInvoker = (this: unknown) => void;
type ReconcileQueueRaceStatusesInvoker = (this: unknown, eventId: string) => void;
type UnstageOpenRaceInvoker = (this: unknown, eventId: string) => void;
type UnstageCurrentRaceInvoker = (this: unknown) => AppSnapshot;
type ResetRaceToStagedInvoker = (this: unknown) => AppSnapshot;
type UnstageTournamentRaceInvoker = (this: unknown) => AppSnapshot;
type UpdateSettingsInvoker = (this: unknown, patch: Partial<AdminSettings>) => AppSnapshot;

function getCountdownInvoker(): CountdownInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "startCountdown");
  if (typeof candidate !== "function") {
    throw new Error("Missing startCountdown implementation");
  }

  return candidate as CountdownInvoker;
}

function getAutoStageInvoker(): AutoStageInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "maybeAutoStageNextRace");
  if (typeof candidate !== "function") {
    throw new Error("Missing maybeAutoStageNextRace implementation");
  }

  return candidate as AutoStageInvoker;
}

function getClearResultPresentationInvoker(): ClearResultPresentationInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "clearRaceResultPresentation");
  if (typeof candidate !== "function") {
    throw new Error("Missing race result presentation clearing implementation");
  }

  return candidate as ClearResultPresentationInvoker;
}

function getReconcileQueueRaceStatusesInvoker(): ReconcileQueueRaceStatusesInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "reconcileQueueRaceStatuses");
  if (typeof candidate !== "function") {
    throw new Error("Missing queue race status reconciliation implementation");
  }

  return candidate as ReconcileQueueRaceStatusesInvoker;
}

function getUnstageOpenRaceInvoker(): UnstageOpenRaceInvoker {
  const candidate: unknown = Reflect.get(
    RollerRumbleApp.prototype,
    "unstageOpenTimeTrialRaceForTournament"
  );
  if (typeof candidate !== "function") {
    throw new Error("Missing open race unstaging implementation");
  }

  return candidate as UnstageOpenRaceInvoker;
}

function getUnstageCurrentRaceInvoker(): UnstageCurrentRaceInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "unstageCurrentRace");
  if (typeof candidate !== "function") {
    throw new Error("Missing current race unstaging implementation");
  }

  return candidate as UnstageCurrentRaceInvoker;
}

function getResetRaceToStagedInvoker(): ResetRaceToStagedInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "resetCurrentRaceToStaged");
  if (typeof candidate !== "function") {
    throw new Error("Missing current race reset implementation");
  }

  return candidate as ResetRaceToStagedInvoker;
}

function getUnstageTournamentRaceInvoker(): UnstageTournamentRaceInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "unstageCurrentTournamentRace");
  if (typeof candidate !== "function") {
    throw new Error("Missing tournament race unstaging implementation");
  }

  return candidate as UnstageTournamentRaceInvoker;
}

function getUpdateSettingsInvoker(): UpdateSettingsInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "updateSettings");
  if (typeof candidate !== "function") {
    throw new Error("Missing settings update implementation");
  }

  return candidate as UpdateSettingsInvoker;
}

const invokeStartCountdown = (
  target: unknown,
  source: "manual" | "os2l" = "manual",
  options?: { countdownDurationMs?: number }
): AppSnapshot => {
  const invoker = getCountdownInvoker();
  return invoker.call(target, source, options);
};

function withAppPrototype<T extends object>(target: T): T {
  Object.setPrototypeOf(target, RollerRumbleApp.prototype);
  return target;
}

function buildRaceRecord(patch: Partial<RaceRecord> = {}): RaceRecord {
  return {
    createdAt: "now",
    eventId: "event-1",
    finishedAt: null,
    format: "match",
    id: "race-1",
    metrics: [],
    mode: "open-time-trial",
    participants: [
      { lane: "left", racerId: "racer-1" },
      { lane: "right", racerId: "racer-2" }
    ],
    queueEntryId: "queue-1",
    stageId: null,
    startedAt: null,
    state: "staging",
    targetDistanceMeters: 250,
    themeId: "neon-night",
    tournamentId: null,
    updatedAt: "now",
    winnerRacerId: null,
    ...patch
  };
}

describe("app service countdown flow", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not auto-stage an open time trial race when start is triggered without a staged race", () => {
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const getSnapshot = vi.fn(() => snapshot);
    const stageNextRace = vi.fn(() => snapshot);

    const result = invokeStartCountdown({
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getCurrentRace: () => null,
        getAdminSettings: () => ({ os2lEnabled: false, mode: "open-time-trial" })
      },
      getSnapshot,
      stageNextRace
    });

    expect(stageNextRace).not.toHaveBeenCalled();
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(snapshot);
  });

  it("does not let manual start stage a queue race while a tournament is active", () => {
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const getSnapshot = vi.fn(() => snapshot);
    const stageNextRace = vi.fn(() => snapshot);

    const result = invokeStartCountdown({
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getCurrentRace: () => null,
        getAdminSettings: () => ({ os2lEnabled: false, mode: "single-elimination" })
      },
      getSnapshot,
      stageNextRace
    });

    expect(stageNextRace).not.toHaveBeenCalled();
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(snapshot);
  });

  it("builds the projector racer URL with active event context", () => {
    const target = withAppPrototype({
      db: {
        getActiveEvent: () => ({ id: "event-123" })
      },
      getLocalBaseUrl: () => "http://192.168.1.50:3187",
      tunnelManager: {
        getState: () => ({ publicUrl: null })
      }
    });

    const url = new URL((target as unknown as RollerRumbleApp).getRacerPageUrl());

    expect(url.origin).toBe("http://192.168.1.50:3187");
    expect(url.pathname).toBe("/racer");
    expect(url.searchParams.get("eventId")).toBe("event-123");
    expect(url.searchParams.get("source")).toBe("projector");
  });

  it("auto-stages the next queued race only in open time trial when the setting is enabled", () => {
    const stageNextRace = vi.fn();
    const autoStageInvoker = getAutoStageInvoker();
    const result = autoStageInvoker.call({
      shouldAutoStageNextRace: () => true,
      stageNextRace
    });

    expect(result).toBe(true);
    expect(stageNextRace).toHaveBeenCalledTimes(1);
  });

  it("does not auto-stage when the setting guard says staging is not allowed", () => {
    const stageNextRace = vi.fn();
    const autoStageInvoker = getAutoStageInvoker();
    const result = autoStageInvoker.call({
      shouldAutoStageNextRace: () => false,
      stageNextRace
    });

    expect(result).toBe(false);
    expect(stageNextRace).not.toHaveBeenCalled();
  });

  it("uses an OS2L-provided countdown duration before activating the race", () => {
    vi.useFakeTimers();
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const updateRace = vi.fn();
    const emitSnapshot = vi.fn();
    const activateRace = vi.fn();
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const currentRace = buildRaceRecord();
    const target = withAppPrototype({
      countdownStartTimer: null,
      countdownTicker: null,
      countdownRuntime: null,
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getAdminSettings: () => ({ os2lEnabled: true }),
        getCurrentRace: () => currentRace,
        updateRace
      },
      emitSnapshot,
      getSnapshot: () => snapshot,
      os2lTrigger: {
        disarmRace: vi.fn()
      },
      sensorAdapter: { drivesCountdown: false }
    });
    Object.defineProperty(target, "activateRace", {
      configurable: true,
      value: activateRace
    });

    invokeStartCountdown(target, "os2l", { countdownDurationMs: 5_500 });

    expect(target.countdownRuntime).toEqual({ durationMs: 5_500, raceId: "race-1" });
    vi.advanceTimersByTime(5_499);
    expect(activateRace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(activateRace).toHaveBeenCalledWith("race-1");
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("arms an already staged race when OS2L is enabled after staging", () => {
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const settings = {
      os2lEnabled: true,
      targetDistanceMeters: 250
    } as AdminSettings;
    const armRace = vi.fn();
    const disarmRace = vi.fn();
    const emitSnapshot = vi.fn();
    const getSnapshot = vi.fn(() => snapshot);
    const setEnabled = vi.fn();
    const updateSettingsInvoker = getUpdateSettingsInvoker();
    const target = withAppPrototype({
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getCurrentRace: () => buildRaceRecord({ state: "staging" }),
        updateAdminSettings: vi.fn(() => settings)
      },
      emitSnapshot,
      getSnapshot,
      maybeAutoStageNextRace: () => false,
      os2lTrigger: {
        armRace,
        disarmRace,
        setEnabled
      },
      serverPort: 3187
    });

    const result = updateSettingsInvoker.call(target, { os2lEnabled: true });

    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(armRace).toHaveBeenCalledWith("race-1");
    expect(disarmRace).not.toHaveBeenCalled();
    expect(emitSnapshot).toHaveBeenCalledTimes(1);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(snapshot);
  });

  it("auto-stages the next race when the winner modal clears", () => {
    const markQueueEntryStatus = vi.fn();
    const emitSnapshot = vi.fn();
    const maybeAutoStageNextRace = vi.fn(() => true);
    const reconcileQueueRaceStatuses = vi.fn();
    const invoker = getClearResultPresentationInvoker();

    invoker.call({
      db: {
        markQueueEntryStatus
      },
      emitSnapshot,
      maybeAutoStageNextRace,
      reconcileQueueRaceStatuses,
      resultPresentation: {
        expiresAt: "later",
        race: { eventId: "event-1", id: "race-1", queueEntryId: "queue-1" } as RaceRecord,
        winnerRacerId: "racer-1"
      },
      resultPresentationTimer: null
    });

    expect(markQueueEntryStatus).toHaveBeenCalledWith("queue-1", "completed");
    expect(reconcileQueueRaceStatuses).toHaveBeenCalledWith("event-1");
    expect(maybeAutoStageNextRace).toHaveBeenCalledTimes(1);
    expect(emitSnapshot).not.toHaveBeenCalled();
  });

  it("completes stale racing queue entries when their linked race is finished", () => {
    const markQueueEntryStatus = vi.fn();
    const invoker = getReconcileQueueRaceStatusesInvoker();

    invoker.call(
      {
        db: {
          listQueueEntries: () => [
            {
              id: "queue-1",
              status: "racing"
            },
            {
              id: "queue-2",
              status: "queued"
            }
          ],
          listRaces: () => [
            {
              id: "race-1",
              queueEntryId: "queue-1",
              state: "finished"
            }
          ],
          markQueueEntryStatus
        }
      },
      "event-1"
    );

    expect(markQueueEntryStatus).toHaveBeenCalledWith("queue-1", "completed");
  });
});

describe("app service hardware-driven countdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("hands the countdown to a sensor that drives its own countdown", () => {
    vi.useFakeTimers();
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const updateRace = vi.fn();
    const activateRace = vi.fn();
    const armCountdown = vi.fn();
    const endRace = vi.fn();
    const currentRace = buildRaceRecord();
    const target = withAppPrototype({
      countdownStartTimer: null,
      countdownTicker: null,
      countdownRuntime: null,
      hardwareCountdownRaceId: null,
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getAdminSettings: () => ({ os2lEnabled: false }),
        getCurrentRace: () => currentRace,
        getRace: () => buildRaceRecord({ state: "countdown" }),
        updateRace
      },
      emitSnapshot: vi.fn(),
      getSnapshot: () => snapshot,
      os2lTrigger: { disarmRace: vi.fn() },
      sensorAdapter: { drivesCountdown: true, armCountdown, endRace }
    });
    Object.defineProperty(target, "activateRace", {
      configurable: true,
      value: activateRace
    });

    invokeStartCountdown(target, "manual", { countdownDurationMs: 3_000 });

    expect(armCountdown).toHaveBeenCalledWith(currentRace.participants);
    expect(target.hardwareCountdownRaceId).toBe("race-1");

    // The app must not run its own activation timer for a box-driven countdown.
    vi.advanceTimersByTime(3_000);
    expect(activateRace).not.toHaveBeenCalled();

    // Past the grace window with no GO, it aborts back to staging, never starting.
    vi.advanceTimersByTime(4_000);
    expect(endRace).toHaveBeenCalled();
    expect(updateRace).toHaveBeenCalledWith("race-1", {
      state: "staging",
      countdownStartedAt: null
    });
    expect(activateRace).not.toHaveBeenCalled();
  });

  it("activates the race when the box reports GO", () => {
    const activateRace = vi.fn();
    const target = withAppPrototype({
      hardwareCountdownRaceId: "race-1",
      countdownStartTimer: null,
      countdownTicker: null,
      countdownRuntime: { raceId: "race-1", durationMs: 3_000 }
    });
    Object.defineProperty(target, "activateRace", {
      configurable: true,
      value: activateRace
    });

    getLifecycleInvoker().call(target, { type: "go" });

    expect(activateRace).toHaveBeenCalledWith("race-1");
    expect(target.hardwareCountdownRaceId).toBeNull();
  });

  it("re-stamps the countdown UI from the box's CD: cadence", () => {
    let stampedCountdownStartedAt: unknown = undefined;
    const updateRace = vi.fn((_raceId: string, patch: { countdownStartedAt?: unknown }) => {
      stampedCountdownStartedAt = patch.countdownStartedAt;
    });
    const emitSnapshot = vi.fn();
    const target = withAppPrototype({
      hardwareCountdownRaceId: "race-1",
      countdownRuntime: null,
      db: { updateRace },
      emitSnapshot
    });

    getLifecycleInvoker().call(target, { type: "countdown", secondsRemaining: 2 });

    expect(target.countdownRuntime).toEqual({ raceId: "race-1", durationMs: 2_000 });
    expect(updateRace).toHaveBeenCalledWith("race-1", {
      countdownStartedAt: stampedCountdownStartedAt
    });
    expect(typeof stampedCountdownStartedAt).toBe("string");
    expect(emitSnapshot).toHaveBeenCalledTimes(1);
  });

  it("reverts to staging when the box aborts the countdown", () => {
    const updateRace = vi.fn();
    const endRace = vi.fn();
    const target = withAppPrototype({
      hardwareCountdownRaceId: "race-1",
      countdownStartTimer: null,
      countdownTicker: null,
      db: {
        getRace: () => buildRaceRecord({ state: "countdown" }),
        updateRace
      },
      emitSnapshot: vi.fn(),
      sensorAdapter: { endRace }
    });

    getLifecycleInvoker().call(target, { type: "abort", reason: "cable yanked" });

    expect(endRace).toHaveBeenCalled();
    expect(updateRace).toHaveBeenCalledWith("race-1", {
      state: "staging",
      countdownStartedAt: null
    });
    expect(target.hardwareCountdownRaceId).toBeNull();
  });

  it("ignores box lifecycle events when no hardware countdown is in flight", () => {
    const activateRace = vi.fn();
    const target = withAppPrototype({ hardwareCountdownRaceId: null });
    Object.defineProperty(target, "activateRace", {
      configurable: true,
      value: activateRace
    });

    getLifecycleInvoker().call(target, { type: "go" });

    expect(activateRace).not.toHaveBeenCalled();
  });

  it("interrupts the live race when the box disconnects mid-race", () => {
    const updateRace = vi.fn();
    const endRace = vi.fn();
    const dispose = vi.fn();
    const emitSnapshot = vi.fn();
    const target = withAppPrototype({
      currentActiveRace: { dispose },
      sensorAdapter: { endRace },
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getCurrentRace: () => buildRaceRecord({ state: "active" }),
        updateRace
      },
      emitSnapshot
    });

    getStatusChangeInvoker().call(target, buildSensorStatus({ connected: false }));

    expect(dispose).toHaveBeenCalled();
    expect(endRace).toHaveBeenCalled();
    expect(updateRace).toHaveBeenCalledWith("race-1", { state: "interrupted" });
    expect(target.currentActiveRace).toBeNull();
  });

  it("does not interrupt on a disconnect when no race is live", () => {
    const emitSnapshot = vi.fn();
    const target = withAppPrototype({
      currentActiveRace: null,
      emitSnapshot
    });

    getStatusChangeInvoker().call(target, buildSensorStatus({ connected: false }));

    expect(emitSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe("app service current race controls", () => {
  it("unstages a staged open queue race and pauses auto-stage until manual staging", () => {
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const updateRace = vi.fn();
    const markQueueEntryStatus = vi.fn();
    const emitSnapshot = vi.fn();
    const getSnapshot = vi.fn(() => snapshot);
    const endRace = vi.fn();
    const disarmRace = vi.fn();
    const invoker = getUnstageCurrentRaceInvoker();
    const target = withAppPrototype({
      autoStagePausedUntilManualStage: false,
      countdownStartTimer: null,
      countdownTicker: null,
      currentRuntime: null,
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getCurrentRace: () => buildRaceRecord(),
        markQueueEntryStatus,
        updateRace
      },
      emitSnapshot,
      getSnapshot,
      runQueueNotificationTriggers: vi.fn(),
      os2lTrigger: {
        disarmRace
      },
      sensorAdapter: {
        endRace
      }
    });

    const result = invoker.call(target);

    expect(updateRace).toHaveBeenCalledWith(
      "race-1",
      expect.objectContaining({
        countdownStartedAt: null,
        metrics: [],
        state: "cancelled",
        winnerRacerId: null
      })
    );
    expect(markQueueEntryStatus).toHaveBeenCalledWith("queue-1", "queued");
    expect(disarmRace).toHaveBeenCalledTimes(1);
    expect(endRace).toHaveBeenCalledTimes(1);
    expect(emitSnapshot).toHaveBeenCalledTimes(1);
    expect(target.autoStagePausedUntilManualStage).toBe(true);
    expect(result).toBe(snapshot);
  });

  it("does not unstage a race after countdown starts", () => {
    const updateRace = vi.fn();
    const markQueueEntryStatus = vi.fn();
    const invoker = getUnstageCurrentRaceInvoker();
    const target = withAppPrototype({
      countdownStartTimer: null,
      countdownTicker: null,
      currentRuntime: null,
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getCurrentRace: () => buildRaceRecord({ state: "active" }),
        markQueueEntryStatus,
        updateRace
      },
      os2lTrigger: {
        disarmRace: vi.fn()
      },
      sensorAdapter: {
        endRace: vi.fn()
      }
    });

    expect(() => invoker.call(target)).toThrow("before countdown starts");
    expect(updateRace).not.toHaveBeenCalled();
    expect(markQueueEntryStatus).not.toHaveBeenCalled();
  });

  it("resets an active race back to staged without completing its queue entry", () => {
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const updateRace = vi.fn();
    const markQueueEntryStatus = vi.fn();
    const emitSnapshot = vi.fn();
    const getSnapshot = vi.fn(() => snapshot);
    const armRace = vi.fn();
    const disarmRace = vi.fn();
    const endRace = vi.fn();
    const invoker = getResetRaceToStagedInvoker();
    const target = withAppPrototype({
      countdownStartTimer: null,
      countdownTicker: null,
      currentRuntime: {
        finalizeTimer: null
      },
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getAdminSettings: () => ({ os2lEnabled: true }),
        getCurrentRace: () =>
          buildRaceRecord({
            metrics: [
              {
                averageSpeedKph: 21,
                currentSpeedKph: 20,
                distanceMeters: 100,
                elapsedMs: 12000,
                lane: "left",
                maxWattage: 310,
                racerId: "racer-1",
                rotationCount: 42,
                topSpeedKph: 32,
                wattage: 260
              }
            ],
            startedAt: "started",
            state: "active",
            winnerRacerId: "racer-1"
          }),
        markQueueEntryStatus,
        updateRace
      },
      emitSnapshot,
      getSnapshot,
      os2lTrigger: {
        armRace,
        disarmRace
      },
      sensorAdapter: {
        endRace
      }
    });

    const result = invoker.call(target);

    expect(updateRace).toHaveBeenCalledWith(
      "race-1",
      expect.objectContaining({
        countdownStartedAt: null,
        metrics: [],
        startedAt: null,
        state: "staging",
        winnerRacerId: null
      })
    );
    expect(markQueueEntryStatus).toHaveBeenCalledWith("queue-1", "staging");
    expect(disarmRace).toHaveBeenCalledTimes(1);
    expect(endRace).toHaveBeenCalledTimes(1);
    expect(armRace).toHaveBeenCalledWith("race-1");
    expect(emitSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(snapshot);
  });
});

describe("app service tournament start flow", () => {
  const stagedOpenRace: RaceRecord = {
    createdAt: "now",
    eventId: "event-1",
    finishedAt: null,
    format: "match",
    id: "race-1",
    metrics: [],
    mode: "open-time-trial",
    participants: [
      { lane: "left", racerId: "racer-1" },
      { lane: "right", racerId: "racer-2" }
    ],
    queueEntryId: "queue-1",
    stageId: null,
    startedAt: null,
    state: "staging",
    targetDistanceMeters: 250,
    themeId: "neon-night",
    tournamentId: null,
    updatedAt: "now",
    winnerRacerId: null
  };

  it("unstages a not-yet-started open race before tournament creation", () => {
    const updateRace = vi.fn();
    const markQueueEntryStatus = vi.fn();
    const disarmRace = vi.fn();
    const invoker = getUnstageOpenRaceInvoker();

    invoker.call(
      {
        db: {
          getCurrentRace: () => stagedOpenRace,
          markQueueEntryStatus,
          updateRace
        },
        os2lTrigger: {
          disarmRace
        }
      },
      "event-1"
    );

    expect(updateRace).toHaveBeenCalledWith(
      "race-1",
      expect.objectContaining({
        countdownStartedAt: null,
        metrics: [],
        state: "cancelled",
        winnerRacerId: null
      })
    );
    expect(markQueueEntryStatus).toHaveBeenCalledWith("queue-1", "queued");
    expect(disarmRace).toHaveBeenCalledTimes(1);
  });

  it("does not silently cancel an open race that already started", () => {
    const updateRace = vi.fn();
    const markQueueEntryStatus = vi.fn();
    const invoker = getUnstageOpenRaceInvoker();

    expect(() =>
      invoker.call(
        {
          db: {
            getCurrentRace: () =>
              ({
                ...stagedOpenRace,
                state: "active"
              }) satisfies RaceRecord,
            markQueueEntryStatus,
            updateRace
          },
          os2lTrigger: {
            disarmRace: vi.fn()
          }
        },
        "event-1"
      )
    ).toThrow("Finish or recover the current open time trial race");

    expect(updateRace).not.toHaveBeenCalled();
    expect(markQueueEntryStatus).not.toHaveBeenCalled();
  });
});

describe("app service tournament staging flow", () => {
  const stagedTournamentRace: RaceRecord = {
    createdAt: "now",
    eventId: "event-1",
    finishedAt: null,
    format: "match",
    id: "race-1",
    metrics: [],
    mode: "single-elimination",
    participants: [
      { lane: "left", racerId: "racer-1" },
      { lane: "right", racerId: "racer-2" }
    ],
    queueEntryId: null,
    stageId: "stage-1",
    startedAt: null,
    state: "staging",
    targetDistanceMeters: 250,
    themeId: "neon-night",
    tournamentId: "tournament-1",
    updatedAt: "now",
    winnerRacerId: null
  };

  it("unstages a tournament race before countdown starts", () => {
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const updateRace = vi.fn();
    const disarmRace = vi.fn();
    const emitSnapshot = vi.fn();
    const getSnapshot = vi.fn(() => snapshot);
    const invoker = getUnstageTournamentRaceInvoker();

    const result = invoker.call({
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getCurrentRace: () => stagedTournamentRace,
        updateRace
      },
      emitSnapshot,
      getSnapshot,
      os2lTrigger: {
        disarmRace
      }
    });

    expect(updateRace).toHaveBeenCalledWith(
      "race-1",
      expect.objectContaining({
        countdownStartedAt: null,
        metrics: [],
        state: "cancelled",
        winnerRacerId: null
      })
    );
    expect(disarmRace).toHaveBeenCalledTimes(1);
    expect(emitSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(snapshot);
  });

  it("does not unstage a tournament race after countdown starts", () => {
    const updateRace = vi.fn();
    const disarmRace = vi.fn();
    const invoker = getUnstageTournamentRaceInvoker();

    expect(() =>
      invoker.call({
        db: {
          getActiveEvent: () => ({ id: "event-1" }),
          getCurrentRace: () =>
            ({
              ...stagedTournamentRace,
              state: "countdown"
            }) satisfies RaceRecord,
          updateRace
        },
        os2lTrigger: {
          disarmRace
        }
      })
    ).toThrow("before countdown starts");

    expect(updateRace).not.toHaveBeenCalled();
    expect(disarmRace).not.toHaveBeenCalled();
  });
});
