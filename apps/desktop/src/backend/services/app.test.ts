import { describe, expect, it, vi } from "vitest";
import type { AppSnapshot, RaceRecord } from "@goldsprints/shared/types";
import { GoldsprintsApp } from "./app";

type CountdownInvoker = (this: unknown, source: "manual" | "os2l") => AppSnapshot;
type AutoStageInvoker = (this: unknown) => boolean;
type ClearResultPresentationInvoker = (this: unknown) => void;
type ReconcileQueueRaceStatusesInvoker = (this: unknown, eventId: string) => void;
type UnstageOpenRaceInvoker = (this: unknown, eventId: string) => void;
type UnstageTournamentRaceInvoker = (this: unknown) => AppSnapshot;

function getCountdownInvoker(): CountdownInvoker {
  const candidate: unknown = Reflect.get(GoldsprintsApp.prototype, "startCountdown");
  if (typeof candidate !== "function") {
    throw new Error("Missing startCountdown implementation");
  }

  return candidate as CountdownInvoker;
}

function getAutoStageInvoker(): AutoStageInvoker {
  const candidate: unknown = Reflect.get(GoldsprintsApp.prototype, "maybeAutoStageNextRace");
  if (typeof candidate !== "function") {
    throw new Error("Missing maybeAutoStageNextRace implementation");
  }

  return candidate as AutoStageInvoker;
}

function getClearResultPresentationInvoker(): ClearResultPresentationInvoker {
  const candidate: unknown = Reflect.get(GoldsprintsApp.prototype, "clearRaceResultPresentation");
  if (typeof candidate !== "function") {
    throw new Error("Missing race result presentation clearing implementation");
  }

  return candidate as ClearResultPresentationInvoker;
}

function getReconcileQueueRaceStatusesInvoker(): ReconcileQueueRaceStatusesInvoker {
  const candidate: unknown = Reflect.get(GoldsprintsApp.prototype, "reconcileQueueRaceStatuses");
  if (typeof candidate !== "function") {
    throw new Error("Missing queue race status reconciliation implementation");
  }

  return candidate as ReconcileQueueRaceStatusesInvoker;
}

function getUnstageOpenRaceInvoker(): UnstageOpenRaceInvoker {
  const candidate: unknown = Reflect.get(
    GoldsprintsApp.prototype,
    "unstageOpenTimeTrialRaceForTournament"
  );
  if (typeof candidate !== "function") {
    throw new Error("Missing open race unstaging implementation");
  }

  return candidate as UnstageOpenRaceInvoker;
}

function getUnstageTournamentRaceInvoker(): UnstageTournamentRaceInvoker {
  const candidate: unknown = Reflect.get(GoldsprintsApp.prototype, "unstageCurrentTournamentRace");
  if (typeof candidate !== "function") {
    throw new Error("Missing tournament race unstaging implementation");
  }

  return candidate as UnstageTournamentRaceInvoker;
}

const invokeStartCountdown = (
  target: unknown,
  source: "manual" | "os2l" = "manual"
): AppSnapshot => {
  const invoker = getCountdownInvoker();
  return invoker.call(target, source);
};

describe("app service countdown flow", () => {
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
