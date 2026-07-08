/**
 * The trailing racer's finish budget: how long, from race start, the racer who has not yet crossed
 * the line has to finish after the winner does, before the race force-finalizes. Kept as small pure
 * functions so the `ActiveRace` and tests derive the same values from one place, and so a saved
 * setting reloaded from disk is picked up on the next read rather than cached at startup.
 */

import {
  DEFAULT_FINISH_BUDGET_PERCENT,
  FINISH_BUDGET_FLOOR_MS
} from "@roller-rumble/shared/constants";

/**
 * The finish-budget percentage, read from the `ROLLER_RUMBLE_FINISH_BUDGET_PERCENT` advanced
 * setting. Falls back to {@link DEFAULT_FINISH_BUDGET_PERCENT} when unset, non-numeric, or below 100
 * — a percentage under the winner's own time would give the trailing racer negative headroom.
 */
export function readFinishBudgetPercent(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.ROLLER_RUMBLE_FINISH_BUDGET_PERCENT ?? "").trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 100 ? parsed : DEFAULT_FINISH_BUDGET_PERCENT;
}

/**
 * The trailing racer's deadline, in elapsed-since-start milliseconds: the winner's finishing elapsed
 * time scaled by the budget percentage, floored so it is never less than {@link FINISH_BUDGET_FLOOR_MS}
 * beyond the winner's finish. Feed it the winner's `finishedAtMs` (which metrics.ts already stores
 * relative to race start).
 */
export function finishBudgetDeadlineMs(winnerElapsedMs: number, percent: number): number {
  const scaled = winnerElapsedMs * (percent / 100);
  return Math.max(scaled, winnerElapsedMs + FINISH_BUDGET_FLOOR_MS);
}
