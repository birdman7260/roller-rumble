import { describe, expect, it } from "vitest";
import {
  forecastTournamentStart,
  isTournamentStartCheckDue,
  resolvePlannedStart
} from "./tournament-start-forecast";

const STARTS_AT = "2026-10-20T20:00:00.000Z";
const minutesBefore = (minutes: number) => Date.parse(STARTS_AT) - minutes * 60_000;

describe("forecastTournamentStart", () => {
  it("counts the races still to fit in when the queue clears before the tournament", () => {
    // 30 minutes left at two minutes a race fits 15 races; 12 are queued.
    expect(
      forecastTournamentStart({
        startsAt: STARTS_AT,
        nowMs: minutesBefore(30),
        racesRemaining: 12,
        secondsPerRace: 120
      })
    ).toEqual({
      msUntilStart: 30 * 60_000,
      msToClearQueue: 24 * 60_000,
      spareRaces: 3,
      onTrack: true
    });
  });

  it("says how many races run over when the queue will not clear in time", () => {
    // 20 minutes left at two and a half minutes a race fits 8 races; 10 are queued.
    expect(
      forecastTournamentStart({
        startsAt: STARTS_AT,
        nowMs: minutesBefore(20),
        racesRemaining: 10,
        secondsPerRace: 150
      })
    ).toEqual({
      msUntilStart: 20 * 60_000,
      msToClearQueue: 25 * 60_000,
      spareRaces: -2,
      onTrack: false
    });
  });
});

describe("isTournamentStartCheckDue", () => {
  const openQueue = {
    startsAt: STARTS_AT,
    dismissedAt: null,
    queueOpen: true,
    tournamentActive: false
  };

  it("comes due twenty minutes before the planned start, and not a moment sooner", () => {
    expect(isTournamentStartCheckDue({ ...openQueue, nowMs: minutesBefore(20) + 1 })).toBe(true);
    expect(isTournamentStartCheckDue({ ...openQueue, nowMs: minutesBefore(20) - 1 })).toBe(false);
  });

  it("stays due after the planned start has passed until the host answers it", () => {
    expect(isTournamentStartCheckDue({ ...openQueue, nowMs: minutesBefore(-5) })).toBe(true);
  });

  it("is never due once answered, with the queue already closed, during a tournament, or with no start planned", () => {
    const nowMs = minutesBefore(10);
    expect(isTournamentStartCheckDue({ ...openQueue, nowMs, dismissedAt: STARTS_AT })).toBe(false);
    expect(isTournamentStartCheckDue({ ...openQueue, nowMs, queueOpen: false })).toBe(false);
    expect(isTournamentStartCheckDue({ ...openQueue, nowMs, tournamentActive: true })).toBe(false);
    expect(isTournamentStartCheckDue({ ...openQueue, nowMs, startsAt: null })).toBe(false);
  });
});

describe("resolvePlannedStart", () => {
  // Local wall-clock times, so the expectations hold in whatever zone the host laptop is in.
  const local = (day: number, hour: number, minute: number) =>
    new Date(2026, 9, day, hour, minute).getTime();

  it("plans the start for later tonight", () => {
    expect(resolvePlannedStart("20:30", local(20, 19, 0))).toBe(
      new Date(local(20, 20, 30)).toISOString()
    );
  });

  it("rolls a start after midnight into tomorrow when the event runs late", () => {
    expect(resolvePlannedStart("00:30", local(20, 22, 15))).toBe(
      new Date(local(21, 0, 30)).toISOString()
    );
  });

  it("keeps a start a little in the past on today, rather than jumping a day ahead", () => {
    expect(resolvePlannedStart("21:00", local(20, 21, 10))).toBe(
      new Date(local(20, 21, 0)).toISOString()
    );
  });

  it("plans nothing for a blank or malformed time", () => {
    expect(resolvePlannedStart("", local(20, 19, 0))).toBeNull();
    expect(resolvePlannedStart("8pm", local(20, 19, 0))).toBeNull();
  });
});
