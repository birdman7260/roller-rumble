import { describe, expect, it } from "vitest";
import { SnapshotAssembler, type SnapshotContext } from "./snapshot-assembler";
import {
  FIXED_NOW_MS,
  makeSnapshotDb,
  SCENARIO_COUNTDOWN_DURATION_MS,
  SCENARIO_OS2L,
  SCENARIO_PHOTO_BOOTH,
  SCENARIO_RESULT_PRESENTATION,
  SCENARIO_STRIPE,
  SCENARIO_TUNNEL
} from "./__fixtures__/snapshot-scenario";

function makeContext(): SnapshotContext {
  return {
    resultPresentation: SCENARIO_RESULT_PRESENTATION,
    tunnel: SCENARIO_TUNNEL,
    os2l: SCENARIO_OS2L,
    photoBooth: SCENARIO_PHOTO_BOOTH,
    stripe: SCENARIO_STRIPE,
    countdownDurationMsFor: () => SCENARIO_COUNTDOWN_DURATION_MS,
    now: () => FIXED_NOW_MS
  };
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
  });
});
