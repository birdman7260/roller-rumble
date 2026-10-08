import type {
  BracketNode,
  RaceRecord,
  RoundRobinMatch,
  TournamentBundle,
  TournamentQueueEntry
} from "@roller-rumble/shared/types";

function getStageOrder(bundle: TournamentBundle, stageId: string): number {
  return bundle.stages.find((stage) => stage.id === stageId)?.order ?? Number.MAX_SAFE_INTEGER;
}

type BracketSide = "winners" | "losers" | "grand-final" | "reset";

function getBracketSide(node: BracketNode): BracketSide {
  const bracket = node.meta.bracket;
  return bracket === "losers" || bracket === "grand-final" || bracket === "reset"
    ? bracket
    : "winners";
}

/**
 * When a bracket node is raced, relative to the rest of its stage. A single bracket plays round by
 * round. A double-elimination bracket interleaves the two sides: losers round 1 takes winners
 * round 1's losers, and each later winners round `w` feeds losers round `2(w-1)`, so a losers
 * round races right after the winners round that drops riders into it — W1, L1, W2, L2, L3, W3,
 * L4, L5, W4, … — and the grand final (then its reset) closes the stage.
 */
function getPlayOrderRank(node: BracketNode): number {
  const round = node.roundNumber;
  switch (getBracketSide(node)) {
    case "winners":
      return 3 * (round - 1);
    case "losers":
      return round === 1 ? 2 : round % 2 === 0 ? (3 * round) / 2 + 1 : (3 * (round - 1)) / 2 + 2;
    case "grand-final":
      return Number.MAX_SAFE_INTEGER - 1;
    case "reset":
      return Number.MAX_SAFE_INTEGER;
  }
}

function getRoundLabel(bundle: TournamentBundle, node: BracketNode): string {
  const round = String(node.roundNumber);
  switch (getBracketSide(node)) {
    case "grand-final":
      return "Grand Final";
    case "reset":
      return "Reset Match";
    case "losers":
      return `Losers ${round}`;
    case "winners":
      return bundle.tournament.preset === "double-elimination"
        ? `Winners ${round}`
        : bundle.tournament.preset === "groups-to-single-elimination"
          ? `Finals ${round}`
          : `Round ${round}`;
  }
}

/** The reset final only races when the losers-side finalist wins the grand final. */
function isUnneededReset(node: BracketNode): boolean {
  return getBracketSide(node) === "reset" && !node.racerAId && !node.racerBId;
}

/**
 * The round-robin play plan: the matches reordered so each next race goes to the riders who have
 * rested longest, ties keeping the bracket's own order. Planned over every match, finished ones
 * included, so the order of what remains holds still as races finish.
 */
function planRoundRobin(matches: RoundRobinMatch[]): RoundRobinMatch[] {
  const remaining = [...matches];
  const lastRacedAt = new Map<string, number>();
  const plan: RoundRobinMatch[] = [];

  while (remaining.length > 0) {
    const turn = plan.length;
    const restOf = (match: RoundRobinMatch) =>
      Math.min(
        ...[match.racerAId, match.racerBId].map(
          (racerId) => turn - (lastRacedAt.get(racerId) ?? Number.NEGATIVE_INFINITY)
        )
      );
    let bestIndex = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      if (restOf(remaining[index]) > restOf(remaining[bestIndex])) {
        bestIndex = index;
      }
    }

    const [next] = remaining.splice(bestIndex, 1);
    lastRacedAt.set(next.racerAId, turn);
    lastRacedAt.set(next.racerBId, turn);
    plan.push(next);
  }

  return plan;
}

/**
 * The group stage's play plan: each group planned on its own, then the groups take turns, so no
 * group sits idle while another plays out. A plain round robin is one unnamed group.
 */
function planGroupStage(matches: RoundRobinMatch[]): RoundRobinMatch[] {
  const groups = new Map<string, RoundRobinMatch[]>();
  for (const match of matches) {
    const label = match.scoreLabel ?? "";
    groups.set(label, [...(groups.get(label) ?? []), match]);
  }
  const plans = [...groups.values()].map(planRoundRobin);
  const longest = Math.max(0, ...plans.map((plan) => plan.length));
  return Array.from({ length: longest }, (_, turn) =>
    plans.flatMap((plan) => (turn < plan.length ? [plan[turn]] : []))
  ).flat();
}

/** A queue entry before numbering, with the stage its race is staged under. */
interface PlannedMatch {
  entry: Omit<TournamentQueueEntry, "position">;
  stageId: string;
}

/** Race states in which the current race still sits at the front of the queue. */
const STAGED_RACE_STATES = new Set<RaceRecord["state"]>(["scheduled", "staging", "countdown"]);

/** The setting on a tournament that holds the match the host pinned to race next. */
const TOURNAMENT_UP_NEXT_SETTING_KEY = "upNextMatchId";

/** The match the host pinned to race next, if any. */
export function getPinnedUpNextMatchId(bundle: TournamentBundle): string | null {
  const value = bundle.tournament.settings[TOURNAMENT_UP_NEXT_SETTING_KEY];
  return typeof value === "string" ? value : null;
}

/** The bundle with `matchId` pinned to race next, or with no pin when `matchId` is null. */
export function withPinnedUpNextMatchId(
  bundle: TournamentBundle,
  matchId: string | null,
  updatedAt: string
): TournamentBundle {
  const { [TOURNAMENT_UP_NEXT_SETTING_KEY]: _previous, ...settings } = bundle.tournament.settings;
  return {
    ...bundle,
    tournament: {
      ...bundle.tournament,
      settings: matchId ? { ...settings, [TOURNAMENT_UP_NEXT_SETTING_KEY]: matchId } : settings,
      updatedAt
    }
  };
}

function getGroupStageId(bundle: TournamentBundle): string {
  return (
    bundle.stages.find((stage) => stage.kind === "groups" || stage.kind === "round-robin") ??
    bundle.stages[0]
  ).id;
}

function toGroupMatch(bundle: TournamentBundle, match: RoundRobinMatch): PlannedMatch {
  return {
    stageId: getGroupStageId(bundle),
    entry: {
      matchId: match.id,
      matchKind: "group",
      tournamentId: bundle.tournament.id,
      roundLabel: match.scoreLabel ?? null,
      racerIds: [match.racerAId, match.racerBId],
      status: "ready",
      pinnedUpNext: false
    }
  };
}

function toBracketMatch(bundle: TournamentBundle, node: BracketNode): PlannedMatch {
  // A groups-to-finals bracket holds "Group A-1"-style placeholders, then the provisional group
  // leaders after each group result, so its slots only count once the whole group stage is raced.
  const groupStageUndecided = bundle.groupMatches.some((match) => !match.winnerRacerId);
  const seededRacerIds = new Set(bundle.seeds.map((seed) => seed.racerId));
  const decidedRacerId = (racerId: string | null | undefined) =>
    !groupStageUndecided && racerId && seededRacerIds.has(racerId) ? racerId : null;
  const racerAId = decidedRacerId(node.racerAId);
  const racerBId = decidedRacerId(node.racerBId);
  return {
    stageId: node.stageId,
    entry: {
      matchId: node.id,
      matchKind: "bracket",
      tournamentId: bundle.tournament.id,
      roundLabel: getRoundLabel(bundle, node),
      racerIds: [racerAId, racerBId],
      status: node.state === "ready" && racerAId && racerBId ? "ready" : "waiting",
      pinnedUpNext: false
    }
  };
}

/** Whether `race` is this match's race: same tournament stage, same two riders. */
function isRaceForMatch(race: RaceRecord, match: PlannedMatch): boolean {
  if (race.tournamentId !== match.entry.tournamentId || race.stageId !== match.stageId) {
    return false;
  }
  const raceRacerIds = race.participants.map((participant) => participant.racerId);
  return (
    raceRacerIds.length === 2 &&
    match.entry.racerIds.every((racerId) => racerId !== null && raceRacerIds.includes(racerId))
  );
}

/**
 * The `tournament queue`: every match the tournament still has to race, in the order the bracket
 * plays it. The current race's match leads while it is staged and leaves once it is on the bikes;
 * a match the host pinned up next follows it, ahead of the bracket's own order.
 */
export function buildTournamentQueue(input: {
  bundle: TournamentBundle;
  currentRace: RaceRecord | null;
}): TournamentQueueEntry[] {
  const { bundle, currentRace } = input;
  const groupMatches = planGroupStage(bundle.groupMatches)
    .filter((match) => !match.winnerRacerId)
    .map((match) => toGroupMatch(bundle, match));
  const bracketMatches = bundle.bracketNodes
    .filter(
      (node) =>
        !node.winnerRacerId &&
        node.state !== "finished" &&
        node.state !== "bye" &&
        !isUnneededReset(node)
    )
    .sort((left, right) => {
      const stageDelta = getStageOrder(bundle, left.stageId) - getStageOrder(bundle, right.stageId);
      if (stageDelta !== 0) {
        return stageDelta;
      }
      const rankDelta = getPlayOrderRank(left) - getPlayOrderRank(right);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return left.matchNumber - right.matchNumber;
    })
    .map((node) => toBracketMatch(bundle, node));

  // Every preset with group matches races them before its bracket: the bracket is the finals.
  const planned = [...groupMatches, ...bracketMatches];

  const currentMatch = currentRace
    ? planned.find((match) => isRaceForMatch(currentRace, match))
    : undefined;
  const stagedMatch =
    currentMatch && currentRace && STAGED_RACE_STATES.has(currentRace.state)
      ? currentMatch
      : undefined;
  const pinnedMatchId = getPinnedUpNextMatchId(bundle);
  const pinnedMatch = planned.find(
    (match) =>
      match !== currentMatch &&
      match.entry.matchId === pinnedMatchId &&
      match.entry.status === "ready"
  );
  const rest = planned.filter((match) => match !== currentMatch && match !== pinnedMatch);

  return [
    ...(stagedMatch ? [{ ...stagedMatch.entry, status: "staging" as const }] : []),
    ...(pinnedMatch ? [{ ...pinnedMatch.entry, pinnedUpNext: true }] : []),
    ...rest.map((match) => match.entry)
  ].map((entry, index) => ({ ...entry, position: index + 1 }));
}
