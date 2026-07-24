import { afterEach, describe, expect, it, vi } from "vitest";
import type { RaceRecord } from "@roller-rumble/shared/types";
import { RaceCountdown, type CountdownArmingPort } from "./race-countdown";

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

function buildArmingPort(patch: Partial<CountdownArmingPort> = {}): {
  port: CountdownArmingPort;
  armCountdown: ReturnType<typeof vi.fn>;
  endRace: ReturnType<typeof vi.fn>;
} {
  const armCountdown = vi.fn();
  const endRace = vi.fn();
  const port: CountdownArmingPort = {
    drivesCountdown: false,
    armCountdown,
    endRace,
    ...patch
  };
  return { port, armCountdown, endRace };
}

function buildCountdown(
  opts: {
    boxCountdownMs?: number;
    drivesCountdown?: boolean;
    onTick?: () => void;
    onGo?: (raceId: string) => void;
  } = {}
) {
  const { port, armCountdown, endRace } = buildArmingPort({
    drivesCountdown: opts.drivesCountdown ?? false
  });
  const onTick = opts.onTick ?? vi.fn();
  const onGo = opts.onGo ?? vi.fn();
  const countdown = new RaceCountdown({
    armingPort: port,
    boxCountdownMs: opts.boxCountdownMs ?? 4_000,
    onTick,
    onGo
  });
  return { countdown, armCountdown, endRace, onTick, onGo };
}

describe("RaceCountdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("fires GO on the app clock at N and never arms a simulator", () => {
    vi.useFakeTimers();
    const { countdown, armCountdown, onGo } = buildCountdown({ drivesCountdown: false });

    countdown.start({ race: buildRaceRecord(), durationMs: 4_000 });

    expect(armCountdown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_999);
    expect(onGo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onGo).toHaveBeenCalledWith("race-1");
  });

  it("holds the box GO for the pre-roll and fires GO on the app clock at N", () => {
    vi.useFakeTimers();
    const race = buildRaceRecord();
    const { countdown, armCountdown, onGo } = buildCountdown({
      drivesCountdown: true,
      boxCountdownMs: 4_000
    });

    // N (10s) is longer than the box countdown (4s), so the pre-roll is 6s.
    countdown.start({ race, durationMs: 10_000 });

    // `g` is held until the tail of the countdown, not sent immediately.
    vi.advanceTimersByTime(5_999);
    expect(armCountdown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(armCountdown).toHaveBeenCalledWith(race.participants);

    // GO fires on the app clock at N.
    expect(onGo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4_000);
    expect(onGo).toHaveBeenCalledWith("race-1");
  });

  it("sends the box GO immediately when the countdown is at or below the box floor", () => {
    vi.useFakeTimers();
    const race = buildRaceRecord();
    const { countdown, armCountdown, onGo } = buildCountdown({
      drivesCountdown: true,
      boxCountdownMs: 4_000
    });

    // 1s is below the 4s box countdown → pre-roll clamps to zero, `g` goes now.
    countdown.start({ race, durationMs: 1_000 });
    expect(armCountdown).toHaveBeenCalledWith(race.participants);
    expect(onGo).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(onGo).toHaveBeenCalledWith("race-1");
  });

  it("re-broadcasts on the 250ms cadence while counting", () => {
    vi.useFakeTimers();
    const { countdown, onTick } = buildCountdown();

    countdown.start({ race: buildRaceRecord(), durationMs: 4_000 });

    vi.advanceTimersByTime(250);
    expect(onTick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(750);
    expect(onTick).toHaveBeenCalledTimes(4);
  });

  it("reports timing while counting and clears it at GO", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { countdown, onGo } = buildCountdown();

    countdown.start({ race: buildRaceRecord(), durationMs: 4_000 });

    expect(countdown.getTiming()).toEqual({
      raceId: "race-1",
      startedAtMs: 1_000,
      durationMs: 4_000
    });

    vi.advanceTimersByTime(4_000);
    expect(onGo).toHaveBeenCalledWith("race-1");
    expect(countdown.getTiming()).toBeNull();
  });

  it("aborts a box countdown: tears down timers, silences the box, never fires GO", () => {
    vi.useFakeTimers();
    const { countdown, endRace, onGo } = buildCountdown({ drivesCountdown: true });

    countdown.start({ race: buildRaceRecord(), durationMs: 10_000 });
    vi.advanceTimersByTime(5_000);
    countdown.abort();

    expect(endRace).toHaveBeenCalledTimes(1);
    expect(countdown.getTiming()).toBeNull();

    // The GO timer is gone; advancing past N does nothing.
    vi.advanceTimersByTime(10_000);
    expect(onGo).not.toHaveBeenCalled();
  });

  it("does not silence the box when aborting a simulator countdown", () => {
    vi.useFakeTimers();
    const { countdown, endRace } = buildCountdown({ drivesCountdown: false });

    countdown.start({ race: buildRaceRecord(), durationMs: 4_000 });
    countdown.abort();

    expect(endRace).not.toHaveBeenCalled();
    expect(countdown.getTiming()).toBeNull();
  });

  it("is idempotent: an abort while idle and a second abort do nothing", () => {
    vi.useFakeTimers();
    const { countdown, endRace } = buildCountdown({ drivesCountdown: true });

    // Stray abort with nothing in flight.
    countdown.abort();
    expect(endRace).not.toHaveBeenCalled();

    countdown.start({ race: buildRaceRecord(), durationMs: 10_000 });
    countdown.abort();
    countdown.abort();
    expect(endRace).toHaveBeenCalledTimes(1);
  });

  it("replacing a running countdown tears down the previous timers", () => {
    vi.useFakeTimers();
    const { countdown, onGo } = buildCountdown();

    countdown.start({ race: buildRaceRecord({ id: "race-1" }), durationMs: 4_000 });
    vi.advanceTimersByTime(2_000);

    // A fresh start supersedes the first; race-1's GO must never fire.
    countdown.start({ race: buildRaceRecord({ id: "race-2" }), durationMs: 4_000 });
    vi.advanceTimersByTime(2_000);
    expect(onGo).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    expect(onGo).toHaveBeenCalledWith("race-2");
    expect(onGo).toHaveBeenCalledTimes(1);
  });
});
