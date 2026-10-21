import { describe, expect, it } from "vitest";
import {
  formatBestFinish,
  formatPower,
  formatRaceClock,
  formatRaceTime,
  formatSpeed
} from "./race-format";

describe("formatRaceTime", () => {
  it("shows seconds to the hundredth under a minute and minutes past it", () => {
    expect(formatRaceTime(28_430)).toBe("28.43s");
    expect(formatRaceTime(62_570)).toBe("1:02.57");
  });

  it("carries a time that rounds up to a whole minute", () => {
    expect(formatRaceTime(59_996)).toBe("1:00.00");
  });
});

describe("formatRaceClock", () => {
  it("always shows minutes, like a stopwatch", () => {
    expect(formatRaceClock(28_430)).toBe("0:28.43");
    expect(formatRaceClock(59_996)).toBe("1:00.00");
  });
});

describe("formatBestFinish", () => {
  it("formats a finish like the results screen", () => {
    expect(formatBestFinish(59_996)).toBe("1:00.00");
  });

  it("shows a dash, or the given text, when there is no finish", () => {
    expect(formatBestFinish(null)).toBe("—");
    expect(formatBestFinish(undefined, "No finish yet")).toBe("No finish yet");
  });
});

describe("formatSpeed", () => {
  it("shows km/h to one decimal, or a dash when there is no reading", () => {
    expect(formatSpeed(52.36)).toBe("52.4 km/h");
    expect(formatSpeed(0)).toBe("0.0 km/h");
    expect(formatSpeed(null)).toBe("—");
  });
});

describe("formatPower", () => {
  it("shows whole watts, or a dash when there is no reading", () => {
    expect(formatPower(811.6)).toBe("812 W");
    expect(formatPower(null)).toBe("—");
  });
});
