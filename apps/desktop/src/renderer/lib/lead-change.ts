import type { RaceMetricsSnapshot } from "@roller-rumble/shared/types";

/**
 * Calibration for the lead-change flash (issue #7), kept in one place so it can
 * be tuned against the real projector. The flash is a discrete companion cue to
 * the continuous leading-edge glow (#6): it fires the instant the standings lead
 * — distance covered, not speed — flips from one lane to the other.
 *
 * - `leadThresholdMeters`: a lane must clear the current leader by more than this
 *   to count as having passed, so jitter at a dead heat never registers a flip.
 * - `reArmMs`: minimum wall time between flashes, so a flurry of passes near a
 *   dead heat does not strobe.
 * - `flashDurationMs`: how long a single burst takes to fade from full to dark —
 *   brief, so it reads as a moment rather than a sustained state.
 */
export const LEAD_CHANGE_CALIBRATION = {
  leadThresholdMeters: 3,
  reArmMs: 1500,
  flashDurationMs: 700
} as const;

export interface ActiveFlash {
  racerId: string;
  /** Wall-clock time the burst started, used to compute the fade envelope. */
  startedMs: number;
}

export interface LeadChangeState {
  /**
   * The racer currently recognized as the standings leader, or null before
   * anyone has led by more than the threshold. Sticky inside the dead-heat band:
   * it only changes when another lane clears it by more than the threshold.
   */
  leaderId: string | null;
  /** The lane currently flashing and when its burst started, or null. */
  flash: ActiveFlash | null;
  /** Wall time of the last flash, for the re-arm interval. */
  lastFlashMs: number;
}

export interface LeadChangeReduceResult {
  nextState: LeadChangeState;
  /** Per-racer flash envelope in [0, 1], decaying over `flashDurationMs`. */
  flashByRacerId: Record<string, number>;
  /**
   * The racer whose burst *started* on this step, or null. This is the discrete
   * lead-change event, exposed so the cue can be counted in DOM-free tests.
   */
  firedRacerId: string | null;
}

export function createLeadChangeState(): LeadChangeState {
  return { leaderId: null, flash: null, lastFlashMs: Number.NEGATIVE_INFINITY };
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

/**
 * The racer recognized as leader given the previous leader and the latest
 * distances. Hysteresis is one-directional and sticky: the previous leader keeps
 * the lead until another lane is more than `thresholdMeters` ahead of them, so
 * oscillation inside the dead-heat band never flips the recognized leader.
 */
function recognizeLeader(
  prevLeaderId: string | null,
  metrics: RaceMetricsSnapshot[],
  thresholdMeters: number
): string | null {
  const sorted = metrics.toSorted((a, b) => b.distanceMeters - a.distanceMeters);
  const top = sorted[0];
  const second = sorted[1];

  if (prevLeaderId == null) {
    // No leader yet: someone must pull clear of the field to take the first lead.
    return top.distanceMeters - second.distanceMeters > thresholdMeters ? top.racerId : null;
  }

  if (top.racerId === prevLeaderId) {
    // The previous leader still covers the most ground (or is tied at the top).
    return prevLeaderId;
  }

  const prevLeaderDistance =
    metrics.find((metric) => metric.racerId === prevLeaderId)?.distanceMeters ??
    Number.NEGATIVE_INFINITY;
  // Another lane now leads on distance — only a true pass (clearing the previous
  // leader by more than the threshold) flips the recognized leader.
  return top.distanceMeters - prevLeaderDistance > thresholdMeters ? top.racerId : prevLeaderId;
}

/**
 * Pure reducer for the lead-change flash. Given the previous state, the latest
 * per-lane metrics, and the current wall time, returns the next state, a
 * per-racer flash envelope in [0, 1], and the racer (if any) whose burst started
 * this step.
 *
 * A flash fires only on a genuine overtake — the recognized standings leader
 * flipping from one racer to a *different* racer — gated by the re-arm interval.
 * Taking the first lead off the line (null → leader) is not an overtake and does
 * not flash. A solo race (fewer than two lanes) never flashes.
 *
 * `nowMs` is a parameter (not read from a clock) so the fade envelope can be
 * advanced deterministically by the React hook on animation frames.
 */
export function reduceLeadChange(
  prev: LeadChangeState,
  metrics: RaceMetricsSnapshot[],
  nowMs: number
): LeadChangeReduceResult {
  // No opponent to overtake — there is nothing to flash.
  if (metrics.length < 2) {
    return {
      nextState: { leaderId: prev.leaderId, flash: null, lastFlashMs: prev.lastFlashMs },
      flashByRacerId: {},
      firedRacerId: null
    };
  }

  const nextLeaderId = recognizeLeader(
    prev.leaderId,
    metrics,
    LEAD_CHANGE_CALIBRATION.leadThresholdMeters
  );

  let flash = prev.flash;
  let lastFlashMs = prev.lastFlashMs;
  let firedRacerId: string | null = null;

  const isOvertake =
    nextLeaderId != null && prev.leaderId != null && nextLeaderId !== prev.leaderId;
  if (isOvertake && nowMs - lastFlashMs >= LEAD_CHANGE_CALIBRATION.reArmMs) {
    flash = { racerId: nextLeaderId, startedMs: nowMs };
    lastFlashMs = nowMs;
    firedRacerId = nextLeaderId;
  }

  const flashByRacerId: Record<string, number> = {};
  if (flash) {
    const envelope = 1 - (nowMs - flash.startedMs) / LEAD_CHANGE_CALIBRATION.flashDurationMs;
    if (envelope > 0) {
      flashByRacerId[flash.racerId] = clamp01(envelope);
    } else {
      flash = null;
    }
  }

  return {
    nextState: { leaderId: nextLeaderId, flash, lastFlashMs },
    flashByRacerId,
    firedRacerId
  };
}
