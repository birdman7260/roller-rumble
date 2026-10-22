import { describe, expect, it } from "vitest";
import type { RaceResult, SensorMonitor } from "@roller-rumble/shared/types";
import { SnapshotAssembler, type SnapshotContext } from "./snapshot-assembler";
import {
  ACTIVE_EVENT_ID,
  CURRENT_RACE,
  FIXED_NOW_MS,
  makeSnapshotDb,
  SCENARIO_OS2L,
  SCENARIO_PHOTO_BOOTH,
  SCENARIO_RESULT_PRESENTATION,
  SCENARIO_RUNTIME_ENV,
  SCENARIO_SENSOR,
  SCENARIO_STRIPE,
  SCENARIO_TUNNEL
} from "./__fixtures__/snapshot-scenario";

function makeContext(overrides: Partial<SnapshotContext> = {}): SnapshotContext {
  return {
    resultPresentation: SCENARIO_RESULT_PRESENTATION,
    tunnel: SCENARIO_TUNNEL,
    os2l: SCENARIO_OS2L,
    photoBooth: SCENARIO_PHOTO_BOOTH,
    stripe: SCENARIO_STRIPE,
    sensor: SCENARIO_SENSOR,
    sensorMonitor: null,
    runtimeEnv: SCENARIO_RUNTIME_ENV,
    countdown: null,
    now: () => FIXED_NOW_MS,
    ...overrides
  };
}

/** A mock db whose current race is mid-countdown, for exercising the projector countdown clock. */
function makeCountdownDb(raceId: string): ReturnType<typeof makeSnapshotDb> {
  return makeSnapshotDb(true, { ...CURRENT_RACE, id: raceId, state: "countdown" });
}

function healthFor(snapshot: ReturnType<SnapshotAssembler["assemble"]>, id: string) {
  const entry = snapshot.subsystemHealth.find((subsystem) => subsystem.id === id);
  if (!entry) {
    throw new Error(`No subsystem health for ${id}`);
  }
  return entry;
}

describe("SnapshotAssembler.assemble", () => {
  it("reproduces the golden full snapshot with includeAllRaceData enabled", async () => {
    const assembler = new SnapshotAssembler(makeSnapshotDb(true));
    const full = assembler.assemble(makeContext());
    await expect(JSON.stringify(full, null, 2)).toMatchFileSnapshot(
      "./__fixtures__/snapshot-full-all.json"
    );
  });

  it("reproduces the golden full snapshot with includeAllRaceData disabled", async () => {
    const assembler = new SnapshotAssembler(makeSnapshotDb(false));
    const full = assembler.assemble(makeContext());
    await expect(JSON.stringify(full, null, 2)).toMatchFileSnapshot(
      "./__fixtures__/snapshot-full-active-only.json"
    );
  });

  it("derives the projector countdown clock from RaceCountdown's in-memory timing (ADR 0017)", () => {
    const raceId = "race-countdown";
    const assembler = new SnapshotAssembler(makeCountdownDb(raceId));

    const snapshot = assembler.assemble(
      makeContext({
        countdown: { raceId, startedAtMs: FIXED_NOW_MS - 1_500, durationMs: 4_000 }
      })
    );

    // 4000ms countdown, 1500ms elapsed at FIXED_NOW → ceil(2500/1000) = 3s remaining, derived from
    // the module's live timing rather than a persisted countdownStartedAt.
    expect(snapshot.raceProjection.countdownSecondsRemaining).toBe(3);
  });

  it("shows no countdown clock when the race is staged as countdown but the module is idle", () => {
    const raceId = "race-countdown";
    const assembler = new SnapshotAssembler(makeCountdownDb(raceId));

    const snapshot = assembler.assemble(makeContext({ countdown: null }));

    expect(snapshot.raceProjection.countdownSecondsRemaining).toBeNull();
  });

  it("measures the race pace from the gaps between the active event's race finishes", () => {
    const assembler = new SnapshotAssembler(
      makeSnapshotDb(false, CURRENT_RACE, [], {
        [ACTIVE_EVENT_ID]: ["2026-06-24T11:50:00.000Z", "2026-06-24T11:52:30.000Z"]
      })
    );

    expect(assembler.assemble(makeContext()).racePace).toEqual({
      secondsPerRace: 150,
      source: "measured",
      sampleCount: 1
    });
  });

  it("uses the operator's minutes per race as the race pace before any gap is measured", () => {
    const assembler = new SnapshotAssembler(makeSnapshotDb(false));

    // The scenario's queueMinutesPerRace is 2.
    expect(assembler.assemble(makeContext()).racePace).toEqual({
      secondsPerRace: 120,
      source: "default",
      sampleCount: 0
    });
  });

  it("shows the planned bracket's cutoff: the slowest best run still inside the bracket", () => {
    const assembler = new SnapshotAssembler(
      makeSnapshotDb(false, CURRENT_RACE, [], {}, { plannedBracketSize: 2 })
    );

    // Ada's 60s and Grace's 65s are the event's only qualifying runs, so Grace holds the last slot.
    expect(assembler.assemble(makeContext()).raceProjection.bracketCutoff).toEqual({
      bracketSize: 2,
      finishTimeMs: 65_000
    });
  });

  it("ranks the active event's runs on the top racers board even with all race data included", () => {
    const assembler = new SnapshotAssembler(makeSnapshotDb(true));

    const snapshot = assembler.assemble(makeContext());

    // Ada's faster 58s run belongs to another event, so her board time is this event's 60s run.
    expect(snapshot.raceProjection.topRacers).toEqual([
      { racerId: "racer-1", raceId: "race-history", finishTimeMs: 60_000 },
      { racerId: "racer-2", raceId: "race-history", finishTimeMs: 65_000 }
    ]);
  });

  it("keeps a racer's event stats to the active event even with all race data included", () => {
    const assembler = new SnapshotAssembler(makeSnapshotDb(true));

    const ada = assembler
      .assemble(makeContext())
      .racers.find((entry) => entry.racer.id === "racer-1");

    // Ada's 58s, 42 km/h, 320 W run belongs to another event; this event has only her 60s run.
    expect(ada?.stats).toMatchObject({
      races: 2,
      bestFinishTimeMs: 58_000,
      eventRaces: 1,
      eventWins: 1,
      eventBestFinishTimeMs: 60_000,
      eventTopSpeedKph: 40,
      eventAverageSpeedKph: 35,
      eventMaxWattage: 300
    });
  });

  it("only counts a run that reached the finish line as a racer's event fastest time", () => {
    // Grace's race was force-finished 120 m into the 250 m race, so its 20s time is not a finish.
    const partialRun: RaceResult = {
      id: "result-partial",
      racerId: "racer-2",
      eventId: ACTIVE_EVENT_ID,
      raceId: "race-history",
      lane: "right",
      placement: 1,
      finishTimeMs: 20_000,
      distanceMeters: 120,
      avgSpeedKph: 30,
      topSpeedKph: 36,
      maxWattage: 250,
      createdAt: "2026-01-03T00:00:00.000Z"
    };
    const assembler = new SnapshotAssembler(makeSnapshotDb(false, CURRENT_RACE, [partialRun]));

    const grace = assembler
      .assemble(makeContext())
      .racers.find((entry) => entry.racer.id === "racer-2");

    expect(grace?.stats).toMatchObject({ eventRaces: 2, eventBestFinishTimeMs: 65_000 });
  });
});

describe("SnapshotAssembler subsystem health", () => {
  const assembler = new SnapshotAssembler(makeSnapshotDb(true));

  it("reports ready subsystems for the healthy scenario", () => {
    const snapshot = assembler.assemble(makeContext());
    expect(healthFor(snapshot, "tunnel").status).toBe("ready");
    expect(healthFor(snapshot, "stripe").status).toBe("ready");
    expect(healthFor(snapshot, "network").status).toBe("ready");
  });

  it("reports a failed tunnel with the cloudflared error and known-error guidance", () => {
    const snapshot = assembler.assemble(
      makeContext({
        tunnel: {
          ...SCENARIO_TUNNEL,
          status: "error",
          message: "Provided Tunnel token is not valid",
          lastError: "Provided Tunnel token is not valid"
        }
      })
    );
    const tunnel = healthFor(snapshot, "tunnel");
    expect(tunnel.status).toBe("failed");
    expect(tunnel.lastError).toContain("token is not valid");
    expect(tunnel.guidance?.code).toBe("tunnel_token_rejected");
  });

  it("reports Stripe disabled when no keys are configured", () => {
    const snapshot = assembler.assemble(
      makeContext({
        stripe: {
          configured: false,
          hasSecretKey: false,
          hasWebhookSecret: false,
          hasExtraCaCertFile: false,
          extraCaCertFile: null,
          publicRacerUrl: null,
          message: "Stripe Checkout is missing secret key, webhook secret, public racer URL."
        }
      })
    );
    expect(healthFor(snapshot, "stripe").status).toBe("disabled");
  });

  it("reports a failed network subsystem when the runtime env file did not load", () => {
    const snapshot = assembler.assemble(
      makeContext({
        runtimeEnv: { ...SCENARIO_RUNTIME_ENV, loadedFiles: [] }
      })
    );
    const network = healthFor(snapshot, "network");
    expect(network.status).toBe("failed");
    expect(network.guidance?.code).toBe("env_file_not_loaded");
  });

  it("reports the sensor ready when connected and failed when it errors", () => {
    expect(healthFor(assembler.assemble(makeContext()), "sensor").status).toBe("ready");

    const failed = assembler.assemble(
      makeContext({
        sensor: {
          ...SCENARIO_SENSOR,
          connected: false,
          detail: "Could not connect to the race box.",
          lastError: "cannot open COM3"
        }
      })
    );
    const sensor = healthFor(failed, "sensor");
    expect(sensor.status).toBe("failed");
    expect(sensor.lastError).toBe("cannot open COM3");
  });

  it("reports the sensor degraded while it is still searching", () => {
    const searching = assembler.assemble(
      makeContext({
        sensor: {
          ...SCENARIO_SENSOR,
          connected: false,
          detail: "No race box found yet — still searching."
        }
      })
    );
    expect(healthFor(searching, "sensor").status).toBe("degraded");
  });
});

describe("SnapshotAssembler.forSurface", () => {
  const assembler = new SnapshotAssembler(makeSnapshotDb(true));

  it("reproduces the golden racer payload", async () => {
    const full = assembler.assemble(makeContext());
    const racer = assembler.forSurface(full, "racer");
    await expect(JSON.stringify(racer, null, 2)).toMatchFileSnapshot(
      "./__fixtures__/snapshot-racer.json"
    );
  });

  it("never sends the admin sensor monitor to a racer phone", () => {
    const monitor: SensorMonitor = {
      adapterId: "opensprints",
      canTest: true,
      mode: "testing",
      streaming: true,
      variant: "basic",
      sampleCount: 3,
      lastSampleElapsedMs: 753,
      lastSampleIntervalMs: 251,
      lastSampleAt: null,
      measuredBoxCountdownMs: 4012,
      configuredBoxCountdownMs: 4000,
      lastGoOffsetMs: null,
      maxSpeedKph: null,
      speedWindowMs: 1000,
      ports: [],
      recentLines: ["t: 753"]
    };
    const full = assembler.assemble(makeContext({ sensorMonitor: monitor }));

    expect(full.sensorMonitor?.measuredBoxCountdownMs).toBe(4012);
    expect(assembler.forSurface(full, "racer").sensorMonitor).toBeNull();
  });

  it("returns the full snapshot unchanged for admin and projector", () => {
    const full = assembler.assemble(makeContext());
    expect(assembler.forSurface(full, "admin")).toEqual(full);
    expect(assembler.forSurface(full, "projector")).toEqual(full);
  });

  it("strips every racer's contact details from the racer payload", () => {
    const full = assembler.assemble(makeContext());
    const racer = assembler.forSurface(full, "racer");

    expect(racer.racers).toHaveLength(full.racers.length);
    for (const entry of racer.racers) {
      expect(entry.racer).toMatchObject({ realName: null, email: null, phone: null });
    }
  });

  it("keeps contact details in the admin snapshot", () => {
    const full = assembler.assemble(makeContext());
    const admin = assembler.forSurface(full, "admin");

    expect(admin.racers.map((entry) => entry.racer.email)).toEqual([
      "ada@example.com",
      "grace@example.com"
    ]);
    expect(admin.racers[0].racer).toMatchObject({
      realName: "Ada Lovelace",
      phone: "555-010-0100"
    });
  });

  it("strips operator-only state and live metrics for racers", () => {
    const full = assembler.assemble(makeContext());
    const racer = assembler.forSurface(full, "racer");

    expect(racer.raceProjection.metricsByRacerId).toEqual({});
    expect(racer.raceProjection.race?.metrics).toEqual([]);
    expect(racer.raceProjection.resultPresentation).toBeNull();
    expect(racer.themes).toEqual([]);
    expect(racer.settings.raceDisplayTickerMessages).toEqual([]);
    expect(racer.os2l.beatMessageCount).toBe(0);
    expect(racer.photoBooth.pendingUploadCount).toBe(0);
    expect(racer.paymentProvider.stripe.hasSecretKey).toBe(false);
    expect(racer.subsystemHealth).toEqual([]);
    expect(racer.runtimeEnv.managedSettings).toEqual([]);
    expect(racer.runtimeEnv.path).toBe("");
  });
});
