import { describe, expect, it, vi } from "vitest";
import type { AppSnapshot, RaceRecord } from "../../shared/types";
import { GoldsprintsApp } from "./app";

type CountdownInvoker = (this: unknown, source: "manual" | "os2l") => AppSnapshot;
type AutoStageInvoker = (this: unknown) => boolean;
type UnstageOpenRaceInvoker = (this: unknown, eventId: string) => void;

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
