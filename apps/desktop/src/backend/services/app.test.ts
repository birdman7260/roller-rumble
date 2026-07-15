import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminSettings,
  AppSnapshot,
  QueueEntry,
  QueueOccurrence,
  RaceRecord,
  RacerNotificationType
} from "@roller-rumble/shared/types";
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

type NotifyRaceCompletedInvoker = (this: unknown, race: RaceRecord) => void;

function getNotifyRaceCompletedInvoker(): NotifyRaceCompletedInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "notifyRaceCompleted");
  if (typeof candidate !== "function") {
    throw new Error("Missing race-completed notification implementation");
  }

  return candidate as NotifyRaceCompletedInvoker;
}

type NotifyTournamentEndedInvoker = (
  this: unknown,
  bundle: unknown,
  excludeRacerIds?: string[]
) => void;
type NotifyTournamentWithdrawnInvoker = (this: unknown, bundle: unknown, racerId: string) => void;

function getNotifyTournamentEndedInvoker(): NotifyTournamentEndedInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "notifyTournamentEnded");
  if (typeof candidate !== "function") {
    throw new Error("Missing tournament-ended notification implementation");
  }
  return candidate as NotifyTournamentEndedInvoker;
}

function getNotifyTournamentWithdrawnInvoker(): NotifyTournamentWithdrawnInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "notifyTournamentWithdrawn");
  if (typeof candidate !== "function") {
    throw new Error("Missing tournament-withdrawn notification implementation");
  }
  return candidate as NotifyTournamentWithdrawnInvoker;
}

function getTournamentChannelKeyMethod(): (this: unknown, ...args: unknown[]) => string {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "tournamentChannelKey");
  if (typeof candidate !== "function") {
    throw new Error("Missing tournament channel key implementation");
  }
  return candidate as (this: unknown, ...args: unknown[]) => string;
}

type RunQueueTriggersInvoker = (this: unknown, eventId: string) => void;

function getRunQueueTriggersInvoker(): RunQueueTriggersInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "runQueueNotificationTriggers");
  if (typeof candidate !== "function") {
    throw new Error("Missing queue notification reconciler implementation");
  }

  // reconcileQueueStatusNotification is called via `this`, so bind it onto the
  // target in each test's context.
  return candidate as RunQueueTriggersInvoker;
}

function getReconcileQueueStatusMethod(): (this: unknown, ...args: unknown[]) => void {
  const candidate: unknown = Reflect.get(
    RollerRumbleApp.prototype,
    "reconcileQueueStatusNotification"
  );
  if (typeof candidate !== "function") {
    throw new Error("Missing queue-status reconcile implementation");
  }
  return candidate as (this: unknown, ...args: unknown[]) => void;
}

type AppPrototypeMethod = (this: unknown, ...args: never[]) => unknown;

function getAppMethod(name: string): AppPrototypeMethod {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, name);
  if (typeof candidate !== "function") {
    throw new Error(`Missing ${name} implementation`);
  }
  return candidate as AppPrototypeMethod;
}

function getQueueStatusChannelKeyMethod(): (this: unknown, ...args: unknown[]) => string {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "queueStatusChannelKey");
  if (typeof candidate !== "function") {
    throw new Error("Missing queue-status channel key implementation");
  }
  return candidate as (this: unknown, ...args: unknown[]) => string;
}

function getQueueStatusChannelPrefixMethod(): (this: unknown, ...args: unknown[]) => string {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "queueStatusChannelPrefix");
  if (typeof candidate !== "function") {
    throw new Error("Missing queue-status channel prefix implementation");
  }
  return candidate as (this: unknown, ...args: unknown[]) => string;
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
    const notifyRaceCompleted = vi.fn();
    const invoker = getClearResultPresentationInvoker();

    invoker.call({
      db: {
        markQueueEntryStatus
      },
      emitSnapshot,
      maybeAutoStageNextRace,
      reconcileQueueRaceStatuses,
      notifyRaceCompleted,
      resultPresentation: {
        expiresAt: "later",
        race: { eventId: "event-1", id: "race-1", queueEntryId: "queue-1" } as RaceRecord,
        winnerRacerId: "racer-1"
      },
      resultPresentationTimer: null
    });

    expect(markQueueEntryStatus).toHaveBeenCalledWith("queue-1", "completed");
    expect(reconcileQueueRaceStatuses).toHaveBeenCalledWith("event-1");
    // "Nice work!" now fires at finalization, not when the overlay clears.
    expect(notifyRaceCompleted).not.toHaveBeenCalled();
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

  function buildHardwareCountdownTarget(overrides: {
    armCountdown: ReturnType<typeof vi.fn>;
    activateRace: ReturnType<typeof vi.fn>;
    currentRace: RaceRecord;
    os2lEnabled?: boolean;
    updateRace?: ReturnType<typeof vi.fn>;
  }) {
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const target = withAppPrototype({
      countdownStartTimer: null,
      armGoTimer: null,
      countdownTicker: null,
      countdownRuntime: null,
      hardwareCountdownRaceId: null,
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        getAdminSettings: () => ({ os2lEnabled: overrides.os2lEnabled ?? false }),
        getCurrentRace: () => overrides.currentRace,
        getRace: () => buildRaceRecord({ state: "countdown" }),
        updateRace: overrides.updateRace ?? vi.fn()
      },
      emitSnapshot: vi.fn(),
      getSnapshot: () => snapshot,
      os2lTrigger: { disarmRace: vi.fn() },
      sensorAdapter: {
        drivesCountdown: true,
        armCountdown: overrides.armCountdown,
        endRace: vi.fn()
      }
    });
    Object.defineProperty(target, "activateRace", {
      configurable: true,
      value: overrides.activateRace
    });
    return target;
  }

  it("holds the box GO for the pre-roll and activates on the app clock at N", () => {
    vi.useFakeTimers();
    const armCountdown = vi.fn();
    const activateRace = vi.fn();
    const currentRace = buildRaceRecord();
    const target = buildHardwareCountdownTarget({ armCountdown, activateRace, currentRace });

    // N (10s) is longer than the default box countdown (4s), so the pre-roll is 6s.
    invokeStartCountdown(target, "manual", { countdownDurationMs: 10_000 });
    expect(target.hardwareCountdownRaceId).toBe("race-1");

    // `g` is held until the tail of the countdown, not sent immediately.
    vi.advanceTimersByTime(5_999);
    expect(armCountdown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(armCountdown).toHaveBeenCalledWith(currentRace.participants);

    // GO fires on the app clock at N regardless of any box signal.
    expect(activateRace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4_000);
    expect(activateRace).toHaveBeenCalledWith("race-1");
    expect(target.hardwareCountdownRaceId).toBeNull();
  });

  it("sends the box GO immediately for a sub-floor countdown, still activating at N", () => {
    vi.useFakeTimers();
    const armCountdown = vi.fn();
    const activateRace = vi.fn();
    const currentRace = buildRaceRecord();
    const target = buildHardwareCountdownTarget({ armCountdown, activateRace, currentRace });

    // 1s is below the 4s box countdown → pre-roll clamps to zero, `g` goes now.
    invokeStartCountdown(target, "manual", { countdownDurationMs: 1_000 });
    expect(armCountdown).toHaveBeenCalledWith(currentRace.participants);
    expect(activateRace).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(activateRace).toHaveBeenCalledWith("race-1");
  });

  it("falls back to the shared default countdown when the cue carries no time", () => {
    vi.useFakeTimers();
    const armCountdown = vi.fn();
    const activateRace = vi.fn();
    const currentRace = buildRaceRecord();
    const target = buildHardwareCountdownTarget({
      armCountdown,
      activateRace,
      currentRace,
      os2lEnabled: true
    });

    invokeStartCountdown(target, "os2l");

    // The default equals the box countdown, so the pre-roll is zero and GO fires at 4s.
    expect(target.countdownRuntime).toEqual({ raceId: "race-1", durationMs: 4_000 });
    expect(armCountdown).toHaveBeenCalledWith(currentRace.participants);
    vi.advanceTimersByTime(3_999);
    expect(activateRace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(activateRace).toHaveBeenCalledWith("race-1");
  });

  it("does not activate when the box reports GO — the app clock owns GO", () => {
    const activateRace = vi.fn();
    const target = withAppPrototype({
      hardwareCountdownRaceId: "race-1",
      countdownStartTimer: null,
      armGoTimer: null,
      countdownTicker: null,
      countdownRuntime: { raceId: "race-1", durationMs: 4_000 }
    });
    Object.defineProperty(target, "activateRace", {
      configurable: true,
      value: activateRace
    });

    getLifecycleInvoker().call(target, { type: "go" });

    // The countdown stays in flight; the app's own timer fires GO at N.
    expect(activateRace).not.toHaveBeenCalled();
    expect(target.hardwareCountdownRaceId).toBe("race-1");
  });

  it("does not re-stamp the countdown UI from the box's CD: cadence", () => {
    const updateRace = vi.fn();
    const emitSnapshot = vi.fn();
    const target = withAppPrototype({
      hardwareCountdownRaceId: "race-1",
      countdownRuntime: null,
      db: { updateRace },
      emitSnapshot
    });

    getLifecycleInvoker().call(target, { type: "countdown", secondsRemaining: 2 });

    expect(target.countdownRuntime).toBeNull();
    expect(updateRace).not.toHaveBeenCalled();
    expect(emitSnapshot).not.toHaveBeenCalled();
  });

  it("reverts to staging when the box aborts the countdown", () => {
    const updateRace = vi.fn();
    const endRace = vi.fn();
    const target = withAppPrototype({
      hardwareCountdownRaceId: "race-1",
      countdownStartTimer: null,
      armGoTimer: null,
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
                rpm: 159,
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

interface UpdateActiveEventInput {
  name?: string;
  description?: string | null;
  signupEyebrow?: string | null;
  signupHeading?: string | null;
}

type UpdateActiveEventInvoker = (this: unknown, input: UpdateActiveEventInput) => AppSnapshot;

function getUpdateActiveEventInvoker(): UpdateActiveEventInvoker {
  const candidate: unknown = Reflect.get(RollerRumbleApp.prototype, "updateActiveEvent");
  if (typeof candidate !== "function") {
    throw new Error("Missing active event update implementation");
  }

  return candidate as UpdateActiveEventInvoker;
}

describe("app service active event update", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the partial update to the active event and rebroadcasts", () => {
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const updateEvent = vi.fn();
    const emitSnapshot = vi.fn();
    const getSnapshot = vi.fn(() => snapshot);
    const target = withAppPrototype({
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        updateEvent
      },
      emitSnapshot,
      getSnapshot
    });

    const input = { name: "Friday Finals", description: "Bring your A game.", signupEyebrow: null };
    const result = getUpdateActiveEventInvoker().call(target, input);

    expect(updateEvent).toHaveBeenCalledWith("event-1", input);
    expect(emitSnapshot).toHaveBeenCalledTimes(1);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(snapshot);
  });

  it("does nothing when there is no active event", () => {
    const snapshot = { generatedAt: "now" } as AppSnapshot;
    const updateEvent = vi.fn();
    const emitSnapshot = vi.fn();
    const getSnapshot = vi.fn(() => snapshot);
    const target = withAppPrototype({
      db: {
        getActiveEvent: () => null,
        updateEvent
      },
      emitSnapshot,
      getSnapshot
    });

    const result = getUpdateActiveEventInvoker().call(target, { name: "Ignored" });

    expect(updateEvent).not.toHaveBeenCalled();
    expect(emitSnapshot).not.toHaveBeenCalled();
    expect(result).toBe(snapshot);
  });
});

describe("app service race-completed notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeTarget() {
    const createNotificationAndDispatch = vi.fn(() => 1);
    const target = {
      db: {
        getRacer: (racerId: string) => ({ displayName: `Name ${racerId}` })
      },
      notifications: { createNotificationAndDispatch },
      queueStatusChannelKey: (eventId: string, racerId: string) =>
        `queue-status:${eventId}:${racerId}`,
      tournamentChannelKey: (tournamentId: string, racerId: string) =>
        `tournament:${tournamentId}:${racerId}`
    };
    return { target, createNotificationAndDispatch };
  }

  it("supersedes each participant's own queue-status channel with a silent update", () => {
    const { target, createNotificationAndDispatch } = makeTarget();

    getNotifyRaceCompletedInvoker().call(
      target,
      buildRaceRecord({
        id: "race-9",
        eventId: "event-1",
        queueEntryId: "queue-1",
        participants: [
          { lane: "left", racerId: "racer-1" },
          { lane: "right", racerId: "racer-2" }
        ]
      })
    );

    expect(createNotificationAndDispatch).toHaveBeenCalledTimes(2);
    expect(createNotificationAndDispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "queue_status_update",
        channelKey: "queue-status:event-1:racer-1",
        triggerKey: "queue-raced:race-9:racer-1",
        racerIds: ["racer-1"]
      })
    );
    expect(createNotificationAndDispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ channelKey: "queue-status:event-1:racer-2" })
    );
  });

  it("supersedes each participant's tournament channel for a tournament race", () => {
    const { target, createNotificationAndDispatch } = makeTarget();

    getNotifyRaceCompletedInvoker().call(
      target,
      buildRaceRecord({
        id: "race-t",
        queueEntryId: null,
        tournamentId: "tournament-1",
        participants: [
          { lane: "left", racerId: "racer-1" },
          { lane: "right", racerId: "racer-2" }
        ]
      })
    );

    expect(createNotificationAndDispatch).toHaveBeenCalledTimes(2);
    expect(createNotificationAndDispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "tournament_update",
        channelKey: "tournament:tournament-1:racer-1",
        triggerKey: "tournament-race-done:race-t:racer-1"
      })
    );
  });

  it("does nothing for a race with neither a queue entry nor a tournament", () => {
    const { target, createNotificationAndDispatch } = makeTarget();

    getNotifyRaceCompletedInvoker().call(
      target,
      buildRaceRecord({ queueEntryId: null, tournamentId: null })
    );

    expect(createNotificationAndDispatch).not.toHaveBeenCalled();
  });
});

describe("app service queue-status reconciler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeEntry(position: number, status: QueueEntry["status"], racerId: string): QueueEntry {
    return {
      id: `entry-${racerId}`,
      position,
      status,
      racerIds: [racerId]
    } as unknown as QueueEntry;
  }

  function runReconcile(
    entries: QueueEntry[],
    live: { channelKey: string; type: RacerNotificationType }[]
  ) {
    const createNotificationAndDispatch =
      vi.fn<(input: { channelKey?: string; type: string }) => number>();
    const target = {
      db: {
        listQueueEntries: () => entries,
        listLiveChannelNotifications: () => live,
        getRacer: (racerId: string) => ({ displayName: `Name ${racerId}` })
      },
      notifications: { createNotificationAndDispatch },
      queueStatusChannelKey: getQueueStatusChannelKeyMethod(),
      queueStatusChannelPrefix: getQueueStatusChannelPrefixMethod(),
      reconcileQueueStatusNotification: getReconcileQueueStatusMethod()
    };
    getRunQueueTriggersInvoker().call(target, "event-1");
    return createNotificationAndDispatch;
  }

  it("assigns you're-up / get-ready by queue position and stays silent further back", () => {
    const dispatch = runReconcile(
      [
        makeEntry(1, "queued", "r1"),
        makeEntry(2, "queued", "r2"),
        makeEntry(3, "queued", "r3"),
        makeEntry(4, "queued", "r4")
      ],
      []
    );

    const byChannel = new Map(dispatch.mock.calls.map(([arg]) => [arg.channelKey, arg.type]));
    expect(byChannel.get("queue-status:event-1:r1")).toBe("queue_you_are_up");
    expect(byChannel.get("queue-status:event-1:r2")).toBe("queue_get_ready");
    expect(byChannel.get("queue-status:event-1:r3")).toBe("queue_get_ready");
    // A racer joining behind the get-ready zone with no live status gets nothing
    // (hang-tight is only a silent downgrade, never a first touch).
    expect(byChannel.has("queue-status:event-1:r4")).toBe(false);
  });

  it("downgrades a racer who drifts back into the hang-tight zone", () => {
    const dispatch = runReconcile(
      [
        makeEntry(1, "queued", "r1"),
        makeEntry(2, "queued", "r2"),
        makeEntry(3, "queued", "r3"),
        makeEntry(4, "queued", "r4")
      ],
      [{ channelKey: "queue-status:event-1:r4", type: "queue_get_ready" }]
    );

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "queue_hang_tight",
        channelKey: "queue-status:event-1:r4"
      })
    );
  });

  it("does not re-notify when the live status already matches the desired state", () => {
    const dispatch = runReconcile(
      [makeEntry(1, "queued", "r1")],
      [{ channelKey: "queue-status:event-1:r1", type: "queue_you_are_up" }]
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("supersedes a removed racer's live waiting status with a silent update", () => {
    const dispatch = runReconcile(
      [],
      [{ channelKey: "queue-status:event-1:r1", type: "queue_you_are_up" }]
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "queue_status_update",
        channelKey: "queue-status:event-1:r1"
      })
    );
  });

  it("leaves a racing racer's status alone (not treated as removed)", () => {
    const dispatch = runReconcile(
      [makeEntry(1, "racing", "r1")],
      [{ channelKey: "queue-status:event-1:r1", type: "queue_you_are_up" }]
    );
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("app service tournament notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeBundle(racerIds: string[]) {
    return {
      tournament: { id: "t1", eventId: "event-1" },
      seeds: racerIds.map((racerId) => ({ racerId })),
      bracketNodes: [],
      groupMatches: []
    };
  }

  function makeTarget() {
    const createNotificationAndDispatch =
      vi.fn<(input: { type: string; channelKey?: string; triggerKey?: string }) => number>();
    const target = {
      db: { getRacer: (racerId: string) => ({ displayName: `Name ${racerId}` }) },
      notifications: { createNotificationAndDispatch },
      tournamentChannelKey: getTournamentChannelKeyMethod()
    };
    return { target, createNotificationAndDispatch };
  }

  it("supersedes every participant's tournament channel when the tournament ends", () => {
    const { target, createNotificationAndDispatch } = makeTarget();

    getNotifyTournamentEndedInvoker().call(target, makeBundle(["r1", "r2"]));

    expect(createNotificationAndDispatch).toHaveBeenCalledTimes(2);
    expect(createNotificationAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tournament_update",
        channelKey: "tournament:t1:r1",
        triggerKey: "tournament-ended:t1:r1"
      })
    );
  });

  it("skips excluded racers so a withdrawn racer is not also told 'thanks for racing'", () => {
    const { target, createNotificationAndDispatch } = makeTarget();

    getNotifyTournamentEndedInvoker().call(target, makeBundle(["r1", "r2"]), ["r1"]);

    expect(createNotificationAndDispatch).toHaveBeenCalledTimes(1);
    expect(createNotificationAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ channelKey: "tournament:t1:r2" })
    );
    expect(createNotificationAndDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ channelKey: "tournament:t1:r1" })
    );
  });

  it("supersedes the withdrawn racer's tournament channel with a removal notice", () => {
    const { target, createNotificationAndDispatch } = makeTarget();

    getNotifyTournamentWithdrawnInvoker().call(target, makeBundle(["r1", "r2"]), "r1");

    expect(createNotificationAndDispatch).toHaveBeenCalledTimes(1);
    expect(createNotificationAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tournament_update",
        channelKey: "tournament:t1:r1",
        triggerKey: "tournament-withdrawn:t1:r1"
      })
    );
  });
});

describe("app service racer leave", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type LeaveAllInvoker = (this: unknown, racerId: string) => AppSnapshot;
  type LeaveEntryInvoker = (this: unknown, entryId: string, racerId: string) => AppSnapshot;

  function occurrence(
    id: string,
    racerId: string,
    overrides: Partial<QueueOccurrence> = {}
  ): QueueOccurrence {
    return {
      id,
      eventId: "event-1",
      racerId,
      status: "queued",
      intent: "auto-match",
      priorIntent: null,
      lockGroupId: null,
      signupSequence: Number(id.replace(/\D/gu, "")) || 1,
      bumpCount: 0,
      raceCountAtJoin: 0,
      projectedPosition: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      ...overrides
    };
  }

  function makeTarget(options: {
    before: QueueOccurrence[];
    entries?: QueueEntry[];
    tournamentActive?: boolean;
  }) {
    const createNotificationAndDispatch = vi.fn<(input: { type: string }) => number>();
    const saveProjectedQueue = vi.fn();
    const runQueueNotificationTriggers = vi.fn();
    const target = {
      db: {
        getActiveEvent: () => ({ id: "event-1" }),
        listQueueOccurrences: () => options.before,
        listQueueEntries: () => options.entries ?? [],
        getRacer: (racerId: string) => ({ displayName: `Name ${racerId}` })
      },
      notifications: { createNotificationAndDispatch },
      getActiveTournamentBundle: () =>
        options.tournamentActive ? { tournament: { id: "t1" } } : null,
      saveProjectedQueue,
      maybeAutoStageNextRace: () => false,
      runQueueNotificationTriggers,
      emitSnapshot: vi.fn(),
      getSnapshot: () => ({}) as AppSnapshot,
      queueStatusChannelKey: getQueueStatusChannelKeyMethod(),
      assertLeaveAllowed: getAppMethod("assertLeaveAllowed"),
      notifyChallengeAbandonmentRemovals: getAppMethod("notifyChallengeAbandonmentRemovals")
    };
    return { target, createNotificationAndDispatch, saveProjectedQueue };
  }

  const leaveAll = getAppMethod("leaveQueueForSessionRacer") as unknown as LeaveAllInvoker;
  const leaveEntry = getAppMethod("leaveQueueEntryForSessionRacer") as unknown as LeaveEntryInvoker;

  function savedOccurrences(saveProjectedQueue: ReturnType<typeof vi.fn>): QueueOccurrence[] {
    return saveProjectedQueue.mock.calls[0][1] as QueueOccurrence[];
  }

  it("leave-all clears only the session racer's queued occurrences", () => {
    const before = [
      occurrence("o1", "r1", { intent: "solo" }),
      occurrence("o2", "r2", { intent: "auto-match" })
    ];
    const { target, saveProjectedQueue, createNotificationAndDispatch } = makeTarget({ before });

    leaveAll.call(target, "r1");

    const saved = savedOccurrences(saveProjectedQueue);
    expect(saved.find((o) => o.id === "o1")?.status).toBe("removed");
    expect(saved.find((o) => o.id === "o2")?.status).toBe("queued");
    expect(createNotificationAndDispatch).not.toHaveBeenCalled();
  });

  it("leave-one clears only the named entry's occurrence for the session racer", () => {
    const before = [
      occurrence("o1", "r1", { intent: "solo" }),
      occurrence("o2", "r2", { intent: "solo" })
    ];
    const entries = [
      {
        id: "q1",
        occurrenceIds: ["o1"],
        racerIds: ["r1"],
        status: "queued"
      } as unknown as QueueEntry,
      {
        id: "q2",
        occurrenceIds: ["o2"],
        racerIds: ["r2"],
        status: "queued"
      } as unknown as QueueEntry
    ];
    const { target, saveProjectedQueue } = makeTarget({ before, entries });

    leaveEntry.call(target, "q1", "r1");

    const saved = savedOccurrences(saveProjectedQueue);
    expect(saved.find((o) => o.id === "o1")?.status).toBe("removed");
    expect(saved.find((o) => o.id === "o2")?.status).toBe("queued");
  });

  it("notifies a fresh-pulled opponent when leaving abandons the challenge", () => {
    const before = [
      occurrence("o1", "r1", {
        intent: "challenge",
        priorIntent: "auto-match",
        lockGroupId: "lock-1"
      }),
      occurrence("o2", "r2", { intent: "challenge", priorIntent: null, lockGroupId: "lock-1" })
    ];
    const { target, createNotificationAndDispatch, saveProjectedQueue } = makeTarget({ before });

    leaveAll.call(target, "r1");

    expect(saveProjectedQueue.mock.calls[0][1]).toBeDefined();
    expect(createNotificationAndDispatch).toHaveBeenCalledTimes(1);
    expect(createNotificationAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "queue_status_update",
        channelKey: "queue-status:event-1:r2",
        racerIds: ["r2"]
      })
    );
  });

  it("stays silent when leaving only restores the opponent to their prior intent", () => {
    const before = [
      occurrence("o1", "r1", { intent: "challenge", priorIntent: null, lockGroupId: "lock-1" }),
      occurrence("o2", "r2", {
        intent: "challenge",
        priorIntent: "auto-match",
        lockGroupId: "lock-1"
      })
    ];
    const { target, createNotificationAndDispatch, saveProjectedQueue } = makeTarget({ before });

    leaveAll.call(target, "r1");

    const saved = savedOccurrences(saveProjectedQueue);
    expect(saved.find((o) => o.id === "o2")).toMatchObject({
      status: "queued",
      intent: "auto-match"
    });
    expect(createNotificationAndDispatch).not.toHaveBeenCalled();
  });

  it("blocks leaving while a tournament pause is in effect", () => {
    const before = [occurrence("o1", "r1")];
    const { target } = makeTarget({ before, tournamentActive: true });

    expect(() => leaveAll.call(target, "r1")).toThrow();
  });
});
