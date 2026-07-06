import { describe, expect, it } from "vitest";
import type { RaceMetricsSnapshot } from "@roller-rumble/shared/types";
import {
  LEAD_CHANGE_CALIBRATION,
  type LeadChangeState,
  createLeadChangeState,
  reduceLeadChange
} from "./lead-change";

function metric(
  racerId: string,
  distanceMeters: number,
  lane: RaceMetricsSnapshot["lane"] = "solo"
): RaceMetricsSnapshot {
  return {
    racerId,
    lane,
    rotationCount: 0,
    elapsedMs: 0,
    distanceMeters,
    rpm: 0,
    currentSpeedKph: 0,
    topSpeedKph: 0,
    averageSpeedKph: 0,
    wattage: 0,
    maxWattage: 0,
    finishedAtMs: null
  };
}

interface Step {
  metrics: RaceMetricsSnapshot[];
  nowMs: number;
}

/** Run a sequence of steps and count how many flashes started across all of them. */
function run(
  steps: Step[],
  initial: LeadChangeState = createLeadChangeState()
): { state: LeadChangeState; fires: string[] } {
  let state = initial;
  const fires: string[] = [];
  for (const step of steps) {
    const result = reduceLeadChange(state, step.metrics, step.nowMs);
    state = result.nextState;
    if (result.firedRacerId) {
      fires.push(result.firedRacerId);
    }
  }
  return { state, fires };
}

const THRESHOLD = LEAD_CHANGE_CALIBRATION.leadThresholdMeters;
const REARM = LEAD_CHANGE_CALIBRATION.reArmMs;

describe("lead-change reducer — overtakes", () => {
  it("fires exactly one flash on a clean pass", () => {
    // A takes the first lead (no flash — taking the lead off the line is not an
    // overtake), then B clears A by more than the threshold (one flash for B).
    const { fires } = run([
      { metrics: [metric("a", 10, "left"), metric("b", 0, "right")], nowMs: 0 },
      { metrics: [metric("a", 20, "left"), metric("b", 18, "right")], nowMs: 500 },
      { metrics: [metric("a", 25, "left"), metric("b", 25 + THRESHOLD + 1, "right")], nowMs: 1000 },
      { metrics: [metric("a", 30, "left"), metric("b", 40, "right")], nowMs: 1500 }
    ]);

    expect(fires).toEqual(["b"]);
  });

  it("does not fire when the trailing lane never clears the threshold", () => {
    // A leads; B creeps to within the threshold but never passes.
    const { fires } = run([
      { metrics: [metric("a", 10, "left"), metric("b", 0, "right")], nowMs: 0 },
      { metrics: [metric("a", 20, "left"), metric("b", 18, "right")], nowMs: 500 },
      {
        metrics: [metric("a", 30, "left"), metric("b", 30 - THRESHOLD + 0.5, "right")],
        nowMs: 1000
      }
    ]);

    expect(fires).toEqual([]);
  });

  it("does not refire while the lead oscillates inside the hysteresis band", () => {
    // A is the established leader; the two trade fractions of a meter back and
    // forth without either clearing the other by the threshold.
    const steps: Step[] = [
      { metrics: [metric("a", 10, "left"), metric("b", 0, "right")], nowMs: 0 }
    ];
    for (let index = 0; index < 20; index += 1) {
      const wobble = index % 2 === 0 ? THRESHOLD - 0.5 : -(THRESHOLD - 0.5);
      steps.push({
        metrics: [metric("a", 100, "left"), metric("b", 100 + wobble, "right")],
        nowMs: 1000 + index * 100
      });
    }

    expect(run(steps).fires).toEqual([]);
  });

  it("fires again on a re-pass once the re-arm interval has elapsed", () => {
    const { fires } = run([
      { metrics: [metric("a", 10, "left"), metric("b", 0, "right")], nowMs: 0 },
      // B overtakes A → flash 1.
      { metrics: [metric("a", 20, "left"), metric("b", 20 + THRESHOLD + 1, "right")], nowMs: 1000 },
      // A re-passes after the re-arm window → flash 2.
      {
        metrics: [metric("a", 60 + THRESHOLD + 1, "left"), metric("b", 60, "right")],
        nowMs: 1000 + REARM + 1
      }
    ]);

    expect(fires).toEqual(["b", "a"]);
  });

  it("suppresses a re-pass that lands inside the re-arm window", () => {
    const { fires } = run([
      { metrics: [metric("a", 10, "left"), metric("b", 0, "right")], nowMs: 0 },
      { metrics: [metric("a", 20, "left"), metric("b", 20 + THRESHOLD + 1, "right")], nowMs: 1000 },
      // A re-passes too soon — still inside the re-arm window.
      {
        metrics: [metric("a", 40 + THRESHOLD + 1, "left"), metric("b", 40, "right")],
        nowMs: 1000 + REARM - 200
      }
    ]);

    expect(fires).toEqual(["b"]);
  });

  it("never fires for a solo race", () => {
    const steps: Step[] = [];
    for (let index = 0; index < 10; index += 1) {
      steps.push({ metrics: [metric("solo", index * 50, "solo")], nowMs: index * 200 });
    }

    expect(run(steps).fires).toEqual([]);
  });
});

describe("lead-change reducer — flash envelope", () => {
  it("peaks at the firing lane and fades to dark over the burst duration", () => {
    const start: Step[] = [
      { metrics: [metric("a", 10, "left"), metric("b", 0, "right")], nowMs: 0 },
      { metrics: [metric("a", 20, "left"), metric("b", 20 + THRESHOLD + 1, "right")], nowMs: 1000 }
    ];
    let state = createLeadChangeState();
    let result = reduceLeadChange(state, start[0].metrics, start[0].nowMs);
    state = result.nextState;
    result = reduceLeadChange(state, start[1].metrics, start[1].nowMs);
    state = result.nextState;

    // Just fired: the passing lane is near full brightness, the other is dark.
    expect(result.flashByRacerId.b).toBeGreaterThan(0.9);
    expect(result.flashByRacerId.a).toBeUndefined();

    // Midway through the burst it has dimmed but is still lit.
    const mid = reduceLeadChange(
      state,
      [metric("a", 25, "left"), metric("b", 40, "right")],
      1000 + LEAD_CHANGE_CALIBRATION.flashDurationMs / 2
    );
    expect(mid.flashByRacerId.b).toBeGreaterThan(0);
    expect(mid.flashByRacerId.b).toBeLessThan(0.6);

    // After the burst duration it is fully dark again.
    const done = reduceLeadChange(
      mid.nextState,
      [metric("a", 30, "left"), metric("b", 50, "right")],
      1000 + LEAD_CHANGE_CALIBRATION.flashDurationMs + 1
    );
    expect(done.flashByRacerId.b).toBeUndefined();
    expect(done.nextState.flash).toBeNull();
  });
});
