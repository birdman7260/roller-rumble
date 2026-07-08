import { describe, expect, it } from "vitest";
import {
  DEFAULT_FINISH_BUDGET_PERCENT,
  FINISH_BUDGET_FLOOR_MS
} from "@roller-rumble/shared/constants";
import { finishBudgetDeadlineMs, readFinishBudgetPercent } from "./finish-budget";

describe("readFinishBudgetPercent", () => {
  it("defaults when unset", () => {
    expect(readFinishBudgetPercent({})).toBe(DEFAULT_FINISH_BUDGET_PERCENT);
  });

  it("reads a valid percentage", () => {
    expect(readFinishBudgetPercent({ ROLLER_RUMBLE_FINISH_BUDGET_PERCENT: "150" })).toBe(150);
  });

  it("accepts exactly 100", () => {
    expect(readFinishBudgetPercent({ ROLLER_RUMBLE_FINISH_BUDGET_PERCENT: "100" })).toBe(100);
  });

  it("rejects values below 100 and falls back to the default", () => {
    expect(readFinishBudgetPercent({ ROLLER_RUMBLE_FINISH_BUDGET_PERCENT: "80" })).toBe(
      DEFAULT_FINISH_BUDGET_PERCENT
    );
  });

  it("rejects non-numeric input and falls back to the default", () => {
    expect(readFinishBudgetPercent({ ROLLER_RUMBLE_FINISH_BUDGET_PERCENT: "fast" })).toBe(
      DEFAULT_FINISH_BUDGET_PERCENT
    );
  });
});

describe("finishBudgetDeadlineMs", () => {
  it("scales the winner's elapsed time by the percentage for a long race", () => {
    // 90s winner at 120% -> deadline 108s from start (18s of extra time, above the floor).
    expect(finishBudgetDeadlineMs(90_000, 120)).toBe(108_000);
  });

  it("floors the extra time so short races never collapse to zero grace", () => {
    // 15s winner at 120% would be only 3s extra; the floor lifts it to winner + 5s.
    expect(finishBudgetDeadlineMs(15_000, 120)).toBe(15_000 + FINISH_BUDGET_FLOOR_MS);
  });

  it("floors even at exactly 100% (no percentage headroom at all)", () => {
    expect(finishBudgetDeadlineMs(90_000, 100)).toBe(90_000 + FINISH_BUDGET_FLOOR_MS);
  });
});
