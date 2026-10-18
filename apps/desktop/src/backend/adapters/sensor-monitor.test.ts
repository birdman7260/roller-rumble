import { describe, expect, it } from "vitest";
import { SensorMonitorTracker, type SensorMonitorConfig } from "./sensor-monitor";

const CONFIG: SensorMonitorConfig = {
  laneAssignments: ["left", "right"],
  portRolloutMeters: [0.5, 0.25, 0.5, 0.5],
  speedWindowMs: 0,
  maxSpeedKph: null,
  boxCountdownMs: 4000
};

function makeTracker(start = 0) {
  let now = start;
  const tracker = new SensorMonitorTracker({ now: () => now });
  return {
    tracker,
    setNow: (value: number) => {
      now = value;
    }
  };
}

function view(tracker: SensorMonitorTracker, config = CONFIG) {
  return tracker.snapshot({ adapterId: "opensprints", canTest: true, variant: "basic" }, config);
}

describe("SensorMonitorTracker", () => {
  it("shows each port's ticks, distance, and speed with its lane and own rollout", () => {
    const { tracker, setNow } = makeTracker();
    tracker.noteArmed("testing");
    setNow(4_250);
    tracker.noteProgress([2, 4, 0, 0], 250, CONFIG);
    setNow(4_500);
    tracker.noteProgress([4, 8, 0, 0], 500, CONFIG);

    const monitor = view(tracker);
    expect(monitor.mode).toBe("testing");
    expect(monitor.streaming).toBe(true);
    expect(monitor.sampleCount).toBe(2);
    expect(monitor.lastSampleIntervalMs).toBe(250);
    expect(monitor.ports.slice(0, 2)).toEqual([
      expect.objectContaining({
        index: 0,
        lane: "left",
        metersPerTick: 0.5,
        ticks: 4,
        lastSampleTicks: 2,
        distanceMeters: 2,
        speedKph: 14.4 // 1m in 250ms = 4 m/s
      }),
      expect.objectContaining({ index: 1, lane: "right", ticks: 8, distanceMeters: 2 })
    ]);
    expect(monitor.ports[2].lane).toBeNull();
  });

  it("measures the box's silent countdown from GO sent to the stream's start", () => {
    const { tracker, setNow } = makeTracker(1_000);
    tracker.noteArmed("testing");
    // First sample lands at 5_300 carrying 251ms of box time: the box went at 5_049.
    setNow(5_300);
    tracker.noteProgress([0, 0, 0, 0], 251, CONFIG);

    expect(view(tracker).measuredBoxCountdownMs).toBe(4_049);
  });

  it("reports how far the box's start was from the app's GO for a race", () => {
    const { tracker, setNow } = makeTracker(0);
    tracker.noteArmed("racing");
    setNow(4_000);
    tracker.noteRaceGo();
    setNow(4_400);
    tracker.noteProgress([0, 0, 0, 0], 100, CONFIG); // box went at 4_300

    expect(view(tracker).lastGoOffsetMs).toBe(300);
  });

  it("counts samples faster than the ceiling and remembers the fastest sample", () => {
    const { tracker, setNow } = makeTracker();
    tracker.noteArmed("testing");
    setNow(1);
    tracker.noteProgress([2, 0, 0, 0], 250, CONFIG); // 4 m/s
    tracker.noteProgress([12, 0, 0, 0], 500, { ...CONFIG, maxSpeedKph: 36 }); // 20 m/s

    const port = view(tracker, { ...CONFIG, maxSpeedKph: 36 }).ports[0];
    expect(port.samplesOverCeiling).toBe(1);
    expect(port.peakSampleSpeedKph).toBe(72);
  });

  it("keeps only the most recent raw lines", () => {
    const { tracker } = makeTracker();
    for (let index = 0; index < 30; index += 1) {
      tracker.noteLine(`t: ${index}`);
    }
    const lines = view(tracker).recentLines;
    expect(lines).toHaveLength(20);
    expect(lines[lines.length - 1]).toBe("t: 29");
  });

  it("starts each arm from zero and goes idle when stopped", () => {
    const { tracker, setNow } = makeTracker();
    tracker.noteArmed("testing");
    setNow(1);
    tracker.noteProgress([5, 5, 0, 0], 250, CONFIG);
    tracker.noteStopped();
    expect(view(tracker).mode).toBe("idle");

    tracker.noteArmed("racing");
    expect(view(tracker).ports[0].ticks).toBe(0);
    expect(view(tracker).sampleCount).toBe(0);
  });
});
