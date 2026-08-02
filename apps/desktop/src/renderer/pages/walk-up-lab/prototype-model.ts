/**
 * PROTOTYPE — THROWAWAY CODE. Not production. See issue #36.
 *
 * The shared, in-memory scenario every variant of the walk-up composition lab drives. Nothing here
 * touches the backend, the snapshot, or the database: the question this prototype answers is "what
 * should the host's race-composition loop look like, tap by tap", not "does the backend work".
 *
 * Three things are deliberately modelled rather than faked, because they are what the variants
 * disagree about:
 *
 * - **Bikes, not a queue.** State is `Record<BikeLane, riderId | null>` — the two physical rollers,
 *   which is what the host is looking at. There is no queue in a `walk-up event` (issue #30), so
 *   there is nothing between composing a race and staging it.
 * - **Riders who have already ridden tonight.** The returning-rider case is half the loop at a
 *   market stall, so the seed has people with rides and best times, not an empty roster.
 * - **Operator effort.** Every action carries a cost in `taps` (discrete deliberate acts) and
 *   `typedChars` (characters the host had to key in). This is the instrument: it is the only way to
 *   compare a command line against a roster of chips without arguing about taste.
 */

/** A real bike. Matches `BikeLane` in `@roller-rumble/shared/race-lanes`; duplicated to stay standalone. */
export type BikeLane = "left" | "right";

export const BIKE_LANES: readonly BikeLane[] = ["left", "right"];

export interface LabRider {
  id: string;
  displayName: string;
  ridesTonight: number;
  bestSeconds: number | null;
  /** Minutes since this rider last raced. `null` means they have not raced tonight. */
  minutesSinceLastRace: number | null;
}

export type LabPhase = "composing" | "countdown" | "racing" | "results";

export interface LabResultEntry {
  riderId: string;
  lane: BikeLane;
  seconds: number;
}

/** What one race cost the operator. The whole point of the prototype. */
export interface LabCost {
  taps: number;
  typedChars: number;
}

export interface WalkUpLabState {
  riders: LabRider[];
  bikes: Record<BikeLane, string | null>;
  phase: LabPhase;
  /** `Date.now()` when the current phase began; drives the fake countdown and race clocks. */
  phaseStartedAt: number;
  now: number;
  result: LabResultEntry[] | null;
  /** Effort spent on the race currently being composed or run. */
  current: LabCost;
  /** Effort spent per completed race, oldest first. */
  completed: LabCost[];
  /** Newest first, so the instrumentation strip can show the last few without reversing. */
  log: string[];
  nextRiderSeq: number;
}

const COUNTDOWN_MS = 3000;
const RACE_MS = 6000;
const LOG_LIMIT = 12;

const NO_COST: LabCost = { taps: 0, typedChars: 0 };

const SEED_RIDERS: LabRider[] = [
  {
    id: "walk-up-lab-rider-1",
    displayName: "Marisol Vega",
    ridesTonight: 2,
    bestSeconds: 41.8,
    minutesSinceLastRace: 6
  },
  {
    id: "walk-up-lab-rider-2",
    displayName: "Dev Ramanathan",
    ridesTonight: 1,
    bestSeconds: 47.2,
    minutesSinceLastRace: 14
  },
  {
    id: "walk-up-lab-rider-3",
    displayName: "Kit",
    ridesTonight: 3,
    bestSeconds: 39.4,
    minutesSinceLastRace: 22
  },
  {
    id: "walk-up-lab-rider-4",
    displayName: "Marcus Odell",
    ridesTonight: 1,
    bestSeconds: 52.9,
    minutesSinceLastRace: 35
  },
  {
    id: "walk-up-lab-rider-5",
    displayName: "Priya Raman",
    ridesTonight: 1,
    bestSeconds: 44.1,
    minutesSinceLastRace: 48
  },
  {
    id: "walk-up-lab-rider-6",
    displayName: "Toby Fitzgerald",
    ridesTonight: 2,
    bestSeconds: 43.6,
    minutesSinceLastRace: 63
  },
  {
    id: "walk-up-lab-rider-7",
    displayName: "Nadia",
    ridesTonight: 1,
    bestSeconds: 55.0,
    minutesSinceLastRace: 71
  },
  {
    id: "walk-up-lab-rider-8",
    displayName: "Sam Whitlock",
    ridesTonight: 1,
    bestSeconds: 49.3,
    minutesSinceLastRace: 88
  }
];

export function createInitialState(now: number): WalkUpLabState {
  return {
    riders: SEED_RIDERS,
    bikes: { left: null, right: null },
    phase: "composing",
    phaseStartedAt: now,
    now,
    result: null,
    current: NO_COST,
    completed: [],
    log: ["An hour into First Fridays. Eight people have ridden so far."],
    nextRiderSeq: 1
  };
}

export type WalkUpLabAction =
  | { type: "stage-rider"; riderId: string; lane: BikeLane; typedChars?: number }
  | { type: "add-rider"; displayName: string; lane: BikeLane; typedChars: number }
  | { type: "clear-bike"; lane: BikeLane }
  | { type: "swap-bikes" }
  | { type: "start-countdown" }
  /** The host clears the finished race. `keep` names the bikes whose rider stays on for another go. */
  | { type: "dismiss-results"; keep: readonly BikeLane[] }
  | { type: "tick"; now: number }
  | { type: "reset" };

export function walkUpLabReducer(state: WalkUpLabState, action: WalkUpLabAction): WalkUpLabState {
  switch (action.type) {
    case "stage-rider":
      return stageRider(state, action.riderId, action.lane, action.typedChars ?? 0);
    case "add-rider":
      return addRider(state, action.displayName, action.lane, action.typedChars);
    case "clear-bike":
      return clearBike(state, action.lane);
    case "swap-bikes":
      return swapBikes(state);
    case "start-countdown":
      return startCountdown(state);
    case "dismiss-results":
      return dismissResults(state, action.keep);
    case "tick":
      return advanceClock(state, action.now);
    case "reset":
      // Reuses the clock the reducer already holds, so nothing outside it has to read the wall clock.
      return createInitialState(state.now);
  }
}

function spend(cost: LabCost, taps: number, typedChars: number): LabCost {
  return { taps: cost.taps + taps, typedChars: cost.typedChars + typedChars };
}

function note(state: WalkUpLabState, line: string): string[] {
  return [line, ...state.log].slice(0, LOG_LIMIT);
}

function stageRider(
  state: WalkUpLabState,
  riderId: string,
  lane: BikeLane,
  typedChars: number
): WalkUpLabState {
  if (state.phase !== "composing") {
    return state;
  }
  const rider = findRider(state, riderId);
  if (!rider) {
    return state;
  }
  // A rider can only be on one bike; staging them somewhere new vacates wherever they were.
  const bikes: Record<BikeLane, string | null> = {
    left: state.bikes.left === riderId ? null : state.bikes.left,
    right: state.bikes.right === riderId ? null : state.bikes.right
  };
  bikes[lane] = riderId;
  return {
    ...state,
    bikes,
    current: spend(state.current, 1, typedChars),
    log: note(state, `${rider.displayName} → ${describeBike(lane)}`)
  };
}

function addRider(
  state: WalkUpLabState,
  displayName: string,
  lane: BikeLane,
  typedChars: number
): WalkUpLabState {
  const trimmed = displayName.trim();
  if (state.phase !== "composing" || trimmed === "") {
    return state;
  }
  const rider: LabRider = {
    id: `walk-up-lab-new-${state.nextRiderSeq}`,
    displayName: trimmed,
    ridesTonight: 0,
    bestSeconds: null,
    minutesSinceLastRace: null
  };
  const bikes: Record<BikeLane, string | null> = { ...state.bikes, [lane]: rider.id };
  return {
    ...state,
    riders: [rider, ...state.riders],
    bikes,
    nextRiderSeq: state.nextRiderSeq + 1,
    current: spend(state.current, 1, typedChars),
    log: note(state, `New rider ${rider.displayName} → ${describeBike(lane)}`)
  };
}

function clearBike(state: WalkUpLabState, lane: BikeLane): WalkUpLabState {
  if (state.phase !== "composing" || state.bikes[lane] === null) {
    return state;
  }
  return {
    ...state,
    bikes: { ...state.bikes, [lane]: null },
    current: spend(state.current, 1, 0),
    log: note(state, `${describeBike(lane)} cleared`)
  };
}

/**
 * The `lane swap` from ADR 0019, in miniature: every staged rider moves to the other bike. Variants
 * that ask the host to place riders on a named bike up front should never need this — whether that
 * is true in practice is one of the things this prototype is for.
 */
function swapBikes(state: WalkUpLabState): WalkUpLabState {
  if (state.phase !== "composing" && state.phase !== "countdown") {
    return state;
  }
  return {
    ...state,
    bikes: { left: state.bikes.right, right: state.bikes.left },
    current: spend(state.current, 1, 0),
    log: note(state, "Riders swapped bikes")
  };
}

function startCountdown(state: WalkUpLabState): WalkUpLabState {
  if (!canStart(state)) {
    return state;
  }
  return {
    ...state,
    phase: "countdown",
    phaseStartedAt: state.now,
    current: spend(state.current, 1, 0),
    log: note(state, "Countdown started")
  };
}

function dismissResults(state: WalkUpLabState, keep: readonly BikeLane[]): WalkUpLabState {
  if (state.phase !== "results") {
    return state;
  }
  const bikes: Record<BikeLane, string | null> = {
    left: keep.includes("left") ? state.bikes.left : null,
    right: keep.includes("right") ? state.bikes.right : null
  };
  const kept = BIKE_LANES.filter((lane) => bikes[lane] !== null);
  return {
    ...state,
    bikes,
    phase: "composing",
    phaseStartedAt: state.now,
    result: null,
    current: NO_COST,
    log: note(
      state,
      kept.length === 0
        ? "Bikes cleared, composing the next race"
        : `Kept ${kept.map(describeBike).join(" and ")} for another go`
    )
  };
}

/**
 * The fake race clock. Phase transitions are derived from elapsed time rather than scheduled from an
 * effect, so nothing here costs the operator a tap — the countdown ending and the race finishing are
 * things that happen *to* them.
 */
function advanceClock(state: WalkUpLabState, now: number): WalkUpLabState {
  const elapsed = now - state.phaseStartedAt;
  if (state.phase === "countdown" && elapsed >= COUNTDOWN_MS) {
    return { ...state, now, phase: "racing", phaseStartedAt: now, log: note(state, "GO") };
  }
  if (state.phase === "racing" && elapsed >= RACE_MS) {
    const result = buildResult(state, now);
    return {
      ...state,
      now,
      phase: "results",
      phaseStartedAt: now,
      result,
      completed: [...state.completed, state.current],
      riders: applyResultToRiders(state.riders, result),
      log: note(state, "Race finished")
    };
  }
  return { ...state, now };
}

function buildResult(state: WalkUpLabState, now: number): LabResultEntry[] {
  return stagedLanes(state).map((lane, index) => ({
    riderId: state.bikes[lane]!,
    lane,
    // Deliberately arbitrary but stable within a race: the numbers only have to look like times.
    seconds: Math.round((38 + ((now / 137 + index * 53) % 22)) * 10) / 10
  }));
}

function applyResultToRiders(riders: LabRider[], result: LabResultEntry[]): LabRider[] {
  const byRiderId = new Map(result.map((entry) => [entry.riderId, entry]));
  return riders.map((rider) => {
    const entry = byRiderId.get(rider.id);
    if (!entry) {
      return rider;
    }
    return {
      ...rider,
      ridesTonight: rider.ridesTonight + 1,
      bestSeconds:
        rider.bestSeconds === null ? entry.seconds : Math.min(rider.bestSeconds, entry.seconds),
      minutesSinceLastRace: 0
    };
  });
}

export function describeBike(lane: BikeLane): string {
  return lane === "left" ? "Left bike" : "Right bike";
}

export function findRider(state: WalkUpLabState, riderId: string): LabRider | undefined {
  return state.riders.find((rider) => rider.id === riderId);
}

/** The bikes with someone on them, always left-then-right so every variant reads the same order. */
export function stagedLanes(state: WalkUpLabState): BikeLane[] {
  return BIKE_LANES.filter((lane) => state.bikes[lane] !== null);
}

export function stagedRiderIds(state: WalkUpLabState): string[] {
  return stagedLanes(state).map((lane) => state.bikes[lane]!);
}

/** Solo versus head-to-head is inferred from how many bikes are taken — never declared. */
export function isSolo(state: WalkUpLabState): boolean {
  return stagedLanes(state).length === 1;
}

export function canStart(state: WalkUpLabState): boolean {
  return state.phase === "composing" && stagedLanes(state).length > 0;
}

export function canSwap(state: WalkUpLabState): boolean {
  return (
    (state.phase === "composing" || state.phase === "countdown") && stagedLanes(state).length > 0
  );
}

/** The bike a rider lands on when the host has not named one. */
export function firstFreeLane(state: WalkUpLabState): BikeLane | null {
  return BIKE_LANES.find((lane) => state.bikes[lane] === null) ?? null;
}

/** Returning riders matching what the host has typed so far, best-known first. */
export function matchRiders(state: WalkUpLabState, query: string): LabRider[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return [];
  }
  return state.riders
    .filter((rider) => rider.displayName.toLowerCase().includes(normalized))
    .slice(0, 5);
}

/** Riders in the order a roster should show them: most recently seen first, newcomers at the top. */
export function ridersByRecency(state: WalkUpLabState): LabRider[] {
  return state.riders.toSorted(
    (first, second) =>
      (first.minutesSinceLastRace ?? -1) - (second.minutesSinceLastRace ?? -1) ||
      first.displayName.localeCompare(second.displayName)
  );
}

export function averageCost(completed: readonly LabCost[]): LabCost | null {
  if (completed.length === 0) {
    return null;
  }
  const total = completed.reduce(
    (running, cost) => spend(running, cost.taps, cost.typedChars),
    NO_COST
  );
  return {
    taps: Math.round((total.taps / completed.length) * 10) / 10,
    typedChars: Math.round((total.typedChars / completed.length) * 10) / 10
  };
}

export function countdownSecondsLeft(state: WalkUpLabState): number {
  return Math.max(0, Math.ceil((COUNTDOWN_MS - (state.now - state.phaseStartedAt)) / 1000));
}

export function raceSecondsElapsed(state: WalkUpLabState): number {
  return Math.max(0, Math.round((state.now - state.phaseStartedAt) / 100) / 10);
}

export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export function describeRider(rider: LabRider): string {
  if (rider.ridesTonight === 0) {
    return "First ride";
  }
  const rides = rider.ridesTonight === 1 ? "1 ride" : `${rider.ridesTonight} rides`;
  return rider.bestSeconds === null ? rides : `${rides} · best ${formatSeconds(rider.bestSeconds)}`;
}

export function describeLastSeen(rider: LabRider): string {
  if (rider.minutesSinceLastRace === null) {
    return "new tonight";
  }
  if (rider.minutesSinceLastRace === 0) {
    return "just raced";
  }
  return `${rider.minutesSinceLastRace}m ago`;
}

export function sortResult(result: LabResultEntry[]): LabResultEntry[] {
  return result.toSorted((first, second) => first.seconds - second.seconds);
}
