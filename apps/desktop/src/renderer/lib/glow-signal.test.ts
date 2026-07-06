import { describe, expect, it } from "vitest";
import type { RaceMetricsSnapshot } from "@roller-rumble/shared/types";
import { type GlowState, type RaceGlowMode, createGlowState, reduceGlow } from "./glow-signal";

function metric(
  racerId: string,
  distanceMeters: number,
  currentSpeedKph: number,
  lane: RaceMetricsSnapshot["lane"] = "solo"
): RaceMetricsSnapshot {
  return {
    racerId,
    lane,
    rotationCount: 0,
    elapsedMs: 0,
    distanceMeters,
    rpm: 0,
    currentSpeedKph,
    topSpeedKph: currentSpeedKph,
    averageSpeedKph: currentSpeedKph,
    wattage: 0,
    maxWattage: 0,
    finishedAtMs: null
  };
}

interface Step {
  metrics: RaceMetricsSnapshot[];
  nowMs: number;
}

function run(
  steps: Step[],
  mode: RaceGlowMode,
  initial: GlowState = createGlowState()
): { state: GlowState; intensity: Record<string, number> } {
  let state = initial;
  let intensity: Record<string, number> = {};
  for (const step of steps) {
    const result = reduceGlow(state, step.metrics, mode, step.nowMs);
    state = result.nextState;
    intensity = result.intensityByRacerId;
  }
  return { state, intensity };
}

/** Steady cruise at `speedKph` for one solo lane, sampled every `dtMs`. */
function cruiseSteps(speedKph: number, count: number, dtMs = 250, startMs = 0): Step[] {
  const distancePerStepMeters = (speedKph / 3.6) * (dtMs / 1000);
  return Array.from({ length: count }, (_unused, index) => ({
    metrics: [metric("solo", distancePerStepMeters * (index + 1), speedKph)],
    nowMs: startMs + dtMs * (index + 1)
  }));
}

describe("glow signal reducer — surge", () => {
  it("rises as a lane accelerates", () => {
    const steps: Step[] = [];
    let distance = 0;
    for (let index = 0; index < 8; index += 1) {
      const speed = 20 + index * 3;
      distance += (speed / 3.6) * 0.25;
      steps.push({ metrics: [metric("solo", distance, speed)], nowMs: 250 * (index + 1) });
    }

    const early = run(steps.slice(0, 3), "surge").intensity.solo;
    const late = run(steps, "surge").intensity.solo;

    expect(late).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(0);
  });

  it("reads ~0 at a steady speed", () => {
    const { intensity } = run(cruiseSteps(30, 12), "surge");
    expect(intensity.solo).toBeLessThan(0.05);
  });

  it("clamps to dark while decelerating", () => {
    const accelerate = cruiseSteps(40, 6);
    const steps: Step[] = [...accelerate];
    let distance = accelerate.at(-1)!.metrics[0].distanceMeters;
    let now = accelerate.at(-1)!.nowMs;
    for (let index = 0; index < 6; index += 1) {
      const speed = 38 - index * 5;
      distance += (speed / 3.6) * 0.25;
      now += 250;
      steps.push({ metrics: [metric("solo", distance, speed)], nowMs: now });
    }

    expect(run(steps, "surge").intensity.solo).toBe(0);
  });

  it("ramps a single spike instead of slamming to full", () => {
    const baseline = cruiseSteps(20, 8);
    const lastDistance = baseline.at(-1)!.metrics[0].distanceMeters;
    const lastNow = baseline.at(-1)!.nowMs;
    const spikeDistance = lastDistance + (40 / 3.6) * 0.25;
    const spiked: Step[] = [
      ...baseline,
      { metrics: [metric("solo", spikeDistance, 40)], nowMs: lastNow + 250 }
    ];

    const intensity = run(spiked, "surge").intensity.solo;
    expect(intensity).toBeGreaterThan(0);
    expect(intensity).toBeLessThan(1);
  });
});

describe("glow signal reducer — rivalry", () => {
  it("lights only the faster lane and darkens the slower one", () => {
    const steps: Step[] = [];
    let fastDistance = 0;
    let slowDistance = 0;
    for (let index = 0; index < 12; index += 1) {
      fastDistance += (34 / 3.6) * 0.25;
      slowDistance += (26 / 3.6) * 0.25;
      steps.push({
        metrics: [
          metric("fast", fastDistance, 34, "left"),
          metric("slow", slowDistance, 26, "right")
        ],
        nowMs: 250 * (index + 1)
      });
    }

    const { intensity } = run(steps, "rivalry");
    expect(intensity.fast).toBeGreaterThan(0);
    expect(intensity.slow).toBe(0);
  });

  it("reads ~0 for both lanes on a tie", () => {
    const steps: Step[] = [];
    let distance = 0;
    for (let index = 0; index < 12; index += 1) {
      distance += (30 / 3.6) * 0.25;
      steps.push({
        metrics: [metric("a", distance, 30, "left"), metric("b", distance, 30, "right")],
        nowMs: 250 * (index + 1)
      });
    }

    const { intensity } = run(steps, "rivalry");
    expect(intensity.a).toBeLessThan(0.05);
    expect(intensity.b).toBeLessThan(0.05);
  });

  it("decays a leader to dark when it stops while the rival keeps going", () => {
    const steps: Step[] = [];
    let leadDistance = 0;
    let chaseDistance = 0;
    for (let index = 0; index < 12; index += 1) {
      leadDistance += (36 / 3.6) * 0.25;
      chaseDistance += (24 / 3.6) * 0.25;
      steps.push({
        metrics: [
          metric("lead", leadDistance, 36, "left"),
          metric("chase", chaseDistance, 24, "right")
        ],
        nowMs: 250 * (index + 1)
      });
    }

    const moving = run(steps, "rivalry");
    expect(moving.intensity.lead).toBeGreaterThan(0);

    // Leader freezes (no new distance); rival keeps pedalling. Advance ~1.5s.
    const frozenLead = leadDistance;
    let now = steps.at(-1)!.nowMs;
    const coastSteps: Step[] = [];
    for (let index = 0; index < 6; index += 1) {
      chaseDistance += (24 / 3.6) * 0.25;
      now += 250;
      coastSteps.push({
        metrics: [
          metric("lead", frozenLead, 36, "left"),
          metric("chase", chaseDistance, 24, "right")
        ],
        nowMs: now
      });
    }

    const coasted = run(coastSteps, "rivalry", moving.state);
    expect(coasted.intensity.lead).toBe(0);
  });
});

describe("glow signal reducer — coast and end of race", () => {
  it("drives a stopped lane to dark within ~1s", () => {
    const surging: Step[] = [];
    let distance = 0;
    for (let index = 0; index < 8; index += 1) {
      const speed = 20 + index * 3;
      distance += (speed / 3.6) * 0.25;
      surging.push({ metrics: [metric("solo", distance, speed)], nowMs: 250 * (index + 1) });
    }
    const surged = run(surging, "surge");
    expect(surged.intensity.solo).toBeGreaterThan(0);

    const frozen = distance;
    const lastSpeed = 41;
    let now = surging.at(-1)!.nowMs;
    const coast: Step[] = [];
    for (let index = 0; index < 6; index += 1) {
      now += 200;
      coast.push({ metrics: [metric("solo", frozen, lastSpeed)], nowMs: now });
    }

    expect(run(coast, "surge", surged.state).intensity.solo).toBe(0);
  });

  it("settles to dark once speeds reach zero at the finish", () => {
    const racing = cruiseSteps(32, 8);
    const racingResult = run(racing, "surge");

    const frozen = racing.at(-1)!.metrics[0].distanceMeters;
    let now = racing.at(-1)!.nowMs;
    const finish: Step[] = [];
    for (let index = 0; index < 8; index += 1) {
      now += 250;
      finish.push({ metrics: [metric("solo", frozen, 0)], nowMs: now });
    }

    expect(run(finish, "surge", racingResult.state).intensity.solo).toBe(0);
  });
});

describe("glow signal reducer — solo fallback", () => {
  it("uses the surge rule for a single-participant race even in rivalry mode", () => {
    const steps: Step[] = [];
    let distance = 0;
    for (let index = 0; index < 8; index += 1) {
      const speed = 18 + index * 3;
      distance += (speed / 3.6) * 0.25;
      steps.push({ metrics: [metric("solo", distance, speed)], nowMs: 250 * (index + 1) });
    }

    expect(run(steps, "rivalry").intensity.solo).toBeGreaterThan(0);
  });
});
