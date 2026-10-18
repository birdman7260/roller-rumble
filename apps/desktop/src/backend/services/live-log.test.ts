import { describe, expect, it } from "vitest";
import { LiveLog } from "./live-log";

const AT = new Date("2026-10-18T12:00:00.000Z");

describe("LiveLog", () => {
  it("formats each message's parts into one line with a rising id", () => {
    const log = new LiveLog();
    log.push({ date: AT, level: "info", data: ["[sensor] port", 0, { ticks: 3 }] });
    log.push({ date: AT, level: "warn", data: ["second"] });

    expect(log.entries()).toEqual([
      { id: 1, at: AT.toISOString(), level: "info", text: "[sensor] port 0 { ticks: 3 }" },
      { id: 2, at: AT.toISOString(), level: "warn", text: "second" }
    ]);
  });

  it("keeps only the newest lines once full", () => {
    const log = new LiveLog(3);
    for (let index = 1; index <= 5; index += 1) {
      log.push({ date: AT, level: "info", data: [`line ${index}`] });
    }

    expect(log.entries().map((entry) => entry.text)).toEqual(["line 3", "line 4", "line 5"]);
  });

  it("empties on clear but never reuses an id", () => {
    const log = new LiveLog();
    log.push({ date: AT, level: "info", data: ["before"] });
    log.clear();
    expect(log.entries()).toEqual([]);

    log.push({ date: AT, level: "info", data: ["after"] });
    expect(log.entries()[0].id).toBe(2);
  });
});
