import { describe, expect, it } from "vitest";
import { getNextRaceTimingLabel, getQueuePositionLabel } from "./queue-position-label";

describe("getQueuePositionLabel", () => {
  it("estimates the wait from the minutes each race takes", () => {
    expect(getQueuePositionLabel(0, 2)).toBe("NOW!");
    expect(getQueuePositionLabel(1, 2)).toBe("In 2 minutes");
    expect(getQueuePositionLabel(2, 3)).toBe("In 6 minutes");
  });

  it("says minute for a one-minute wait", () => {
    expect(getQueuePositionLabel(1, 1)).toBe("In 1 minute");
  });

  it("estimates every race further back, with no hype lines", () => {
    expect(getQueuePositionLabel(3, 2)).toBe("In 6 minutes");
    expect(getQueuePositionLabel(4, 2)).toBe("In 8 minutes");
    expect(getQueuePositionLabel(5, 2)).toBe("In 10 minutes");
    expect(getQueuePositionLabel(12, 3)).toBe("In 36 minutes");
  });
});

describe("getNextRaceTimingLabel", () => {
  it("matches the queue label away from the hype lines", () => {
    expect(getNextRaceTimingLabel(0, 2)).toBe("NOW!");
    expect(getNextRaceTimingLabel(2, 2)).toBe("In 4 minutes");
    expect(getNextRaceTimingLabel(7, 2)).toBe("In 14 minutes");
  });

  it("appends the estimate to a hype line", () => {
    expect(getNextRaceTimingLabel(3, 2)).toBe("Get the mind right (in 6 minutes)");
    expect(getNextRaceTimingLabel(4, 5)).toBe("Start stretching (in 20 minutes)");
  });
});
