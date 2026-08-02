import { describe, expect, it } from "vitest";
import type { RaceParticipant } from "@roller-rumble/shared/types";
import type { RotationEvent, SensorLifecycleEvent } from "./sensor";
import type { SensorLaneAssignment } from "./sensor-config";
import { parseOpenSprintsLine } from "./opensprints-protocol";
import { OpenSprintsSession } from "./opensprints-session";
import { swapParticipantLanes } from "@roller-rumble/shared/race-lanes";

const PARTICIPANTS: RaceParticipant[] = [
  { racerId: "r-left", lane: "left" },
  { racerId: "r-right", lane: "right" }
];

interface Recorder {
  rotations: RotationEvent[];
  lifecycle: SensorLifecycleEvent[];
  session: OpenSprintsSession;
}

function makeSession(
  now: () => number = () => 1_000,
  laneAssignments?: SensorLaneAssignment[]
): Recorder {
  const rotations: RotationEvent[] = [];
  const lifecycle: SensorLifecycleEvent[] = [];
  const session = new OpenSprintsSession({
    onRotation: (event) => rotations.push(event),
    onLifecycle: (event) => lifecycle.push(event),
    laneAssignments,
    now
  });
  return { rotations, lifecycle, session };
}

/** Parse a raw box line and feed it in; mirrors what the transport will do. */
function feed(session: OpenSprintsSession, line: string): void {
  const message = parseOpenSprintsLine(line);
  if (message) {
    session.handleMessage(message);
  }
}

describe("OpenSprintsSession", () => {
  it("emits countdown steps then GO from CD: lines", () => {
    const { session, lifecycle } = makeSession();
    session.begin(PARTICIPANTS);

    feed(session, "CD:3");
    feed(session, "CD:2");
    feed(session, "CD:1");
    feed(session, "CD:0");

    expect(lifecycle).toEqual([
      { type: "countdown", secondsRemaining: 3 },
      { type: "countdown", secondsRemaining: 2 },
      { type: "countdown", secondsRemaining: 1 },
      { type: "go" }
    ]);
  });

  it("maps sensor positions to participants and emits per-sample tick deltas", () => {
    const { session, rotations } = makeSession(() => 10_000);
    session.begin(PARTICIPANTS);
    feed(session, "CD:0");

    // Box zeroes counters at GO; cumulative ticks grow each sample.
    feed(session, "R:2,1,0,0,100");
    feed(session, "R:5,3,0,0,200");

    expect(rotations).toEqual([
      { racerId: "r-left", lane: "left", timestampMs: 10_100, deltaRotations: 2 },
      { racerId: "r-right", lane: "right", timestampMs: 10_100, deltaRotations: 1 },
      { racerId: "r-left", lane: "left", timestampMs: 10_200, deltaRotations: 3 },
      { racerId: "r-right", lane: "right", timestampMs: 10_200, deltaRotations: 2 }
    ]);
  });

  it("anchors progress timestamps to the wall clock captured at GO", () => {
    // GO happens at 5_000; elapsedMs in R: is relative to that.
    const { session, rotations } = makeSession(() => 5_000);
    session.begin(PARTICIPANTS);
    feed(session, "CD:0");
    feed(session, "R:1,0,0,0,250");

    expect(rotations[0].timestampMs).toBe(5_250);
  });

  it("treats the first progress line as GO even if CD:0 was missed", () => {
    const { session, lifecycle, rotations } = makeSession(() => 2_000);
    session.begin(PARTICIPANTS);

    feed(session, "R:1,1,0,0,50");

    expect(lifecycle).toEqual([{ type: "go" }]);
    expect(rotations).toHaveLength(2);
    expect(rotations[0].timestampMs).toBe(2_050);
  });

  it("ignores sensor positions with no mapped participant", () => {
    const { session, rotations } = makeSession();
    session.begin(PARTICIPANTS);
    feed(session, "CD:0");

    // Sensors 2 and 3 are wired but unused; their ticks must not be emitted.
    feed(session, "R:0,0,7,9,100");

    expect(rotations).toEqual([]);
  });

  it("recovers a sane delta if the box resets counters mid-stream", () => {
    const { session, rotations } = makeSession(() => 0);
    session.begin(PARTICIPANTS);
    feed(session, "CD:0");
    feed(session, "R:10,0,0,0,100");
    rotations.length = 0;

    // A drop below the last value means a reset; the new value is the delta.
    feed(session, "R:3,0,0,0,200");

    expect(rotations).toEqual([
      { racerId: "r-left", lane: "left", timestampMs: 200, deltaRotations: 3 }
    ]);
  });

  it("hears a solo racer on the bike they actually took when no lane map is configured", () => {
    // Riders pick their own bike, so a solo racer can be on the right one. Without a lane map the
    // session assumes the conventional wiring (port 0 = left bike, port 1 = right) rather than
    // pinning the lone racer to port 0.
    const { session, rotations } = makeSession(() => 0);
    session.begin([{ racerId: "r-solo", lane: "right" }]);
    feed(session, "CD:0");

    feed(session, "R:0,4,0,0,100");

    expect(rotations).toEqual([
      { racerId: "r-solo", lane: "right", timestampMs: 100, deltaRotations: 4 }
    ]);
  });

  it("keeps a legacy solo-lane race on the left port when no lane map is configured", () => {
    // A race staged before the lane swap existed carries lane:"solo", which names no bike.
    const { session, rotations } = makeSession(() => 0);
    session.begin([{ racerId: "r-legacy", lane: "solo" }]);
    feed(session, "CD:0");

    feed(session, "R:3,0,0,0,100");

    expect(rotations).toEqual([
      { racerId: "r-legacy", lane: "solo", timestampMs: 100, deltaRotations: 3 }
    ]);
  });

  it("follows a configured lane map over the conventional wiring", () => {
    const { session, rotations } = makeSession(() => 0, ["right", "left"]);
    session.begin(PARTICIPANTS);
    feed(session, "CD:0");

    feed(session, "R:6,2,0,0,100");

    expect(rotations).toEqual([
      { racerId: "r-right", lane: "right", timestampMs: 100, deltaRotations: 6 },
      { racerId: "r-left", lane: "left", timestampMs: 100, deltaRotations: 2 }
    ]);
  });

  it("ignores version, finish, false-start, and length-ack chatter", () => {
    const { session, rotations, lifecycle } = makeSession();
    session.begin(PARTICIPANTS);
    feed(session, "V:SS_v0.1.7");
    feed(session, "L:1000000");
    feed(session, "CD:0");
    feed(session, "FS:1");
    feed(session, "0F:1234");

    expect(rotations).toEqual([]);
    expect(lifecycle).toEqual([{ type: "go" }]);
  });
});

describe("OpenSprintsSession after a lane swap", () => {
  // The seam the whole "riders pick their own bike" behaviour rests on: the lineup the host
  // corrected is what the session maps ports with. `startCountdown` re-reads the race before
  // arming, so a swap applied while staging is the lineup that reaches the box.
  it("hears a swapped solo racer on the bike they moved to, and not on the one they left", () => {
    const staged: RaceParticipant[] = [{ racerId: "r-solo", lane: "left" }];
    const afterSwap = swapParticipantLanes(staged);

    const { session, rotations } = makeSession(() => 0);
    session.begin(afterSwap);
    feed(session, "CD:0");

    // Port 0 is the bike they got off; port 1 is the one they are actually on.
    feed(session, "R:9,4,0,0,100");

    expect(rotations).toEqual([
      { racerId: "r-solo", lane: "right", timestampMs: 100, deltaRotations: 4 }
    ]);
  });

  it("hands each head-to-head racer the other bike's ticks", () => {
    const afterSwap = swapParticipantLanes(PARTICIPANTS);

    const { session, rotations } = makeSession(() => 0);
    session.begin(afterSwap);
    feed(session, "CD:0");

    feed(session, "R:5,7,0,0,100");

    expect(rotations).toEqual([
      { racerId: "r-right", lane: "left", timestampMs: 100, deltaRotations: 5 },
      { racerId: "r-left", lane: "right", timestampMs: 100, deltaRotations: 7 }
    ]);
  });
});
