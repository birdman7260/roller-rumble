import { describe, expect, it } from "vitest";
import { SnapshotAssembler, type SnapshotContext } from "./snapshot-assembler";
import {
  FIXED_NOW_MS,
  makeSnapshotDb,
  SCENARIO_COUNTDOWN_DURATION_MS,
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
    runtimeEnv: SCENARIO_RUNTIME_ENV,
    countdownDurationMsFor: () => SCENARIO_COUNTDOWN_DURATION_MS,
    now: () => FIXED_NOW_MS,
    ...overrides
  };
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

  it("returns the full snapshot unchanged for admin and projector", () => {
    const full = assembler.assemble(makeContext());
    expect(assembler.forSurface(full, "admin")).toEqual(full);
    expect(assembler.forSurface(full, "projector")).toEqual(full);
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
