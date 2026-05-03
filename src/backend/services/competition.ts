import { nanoid } from "nanoid";
import type {
  BracketNode,
  RaceResult,
  Racer,
  RoundRobinMatch,
  RoundRobinStanding,
  TournamentParticipantSeed,
  TournamentPreset
} from "../../shared/types";

interface EliminationRouting {
  winnerSlot?: "a" | "b";
  loserSlot?: "a" | "b";
  bracket?: "winners" | "losers" | "grand-final" | "reset";
}

function nextPowerOfTwo(value: number): number {
  let power = 1;
  while (power < value) {
    power *= 2;
  }
  return power;
}

function resolveEliminationBracketSize(
  seedCount: number,
  minimumSize: number,
  bracketSize?: number
) {
  return nextPowerOfTwo(Math.max(minimumSize, bracketSize ?? seedCount));
}

function seedOrdering(size: number): number[] {
  if (size === 1) {
    return [1];
  }

  // Mirrors a standard seeded bracket so the strongest seeds only collide in later rounds.
  const previous = seedOrdering(size / 2);
  const ordered: number[] = [];
  for (const seed of previous) {
    ordered.push(seed, size + 1 - seed);
  }
  return ordered;
}

export function buildSeeds(racers: Racer[], results: RaceResult[]): TournamentParticipantSeed[] {
  const byRacer = new Map<string, RaceResult[]>();
  for (const result of results) {
    byRacer.set(result.racerId, [...(byRacer.get(result.racerId) ?? []), result]);
  }

  // Wins dominate seeding, with speed and participation breaking ties for racers in open time trial.
  const scored = racers.map((racer) => {
    const racerResults = byRacer.get(racer.id) ?? [];
    const wins = racerResults.filter((result) => result.placement === 1).length;
    const avgTopSpeed =
      racerResults.length === 0
        ? 0
        : racerResults.reduce((sum, result) => sum + result.topSpeedKph, 0) / racerResults.length;
    const avgSpeed =
      racerResults.length === 0
        ? 0
        : racerResults.reduce((sum, result) => sum + result.avgSpeedKph, 0) / racerResults.length;

    return {
      racerId: racer.id,
      label: racer.displayName,
      score: Number(
        (wins * 1000 + avgTopSpeed * 20 + avgSpeed * 10 + racerResults.length).toFixed(2)
      )
    };
  });

  return scored
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.label.localeCompare(right.label);
    })
    .map((seed, index) => ({
      ...seed,
      seed: index + 1
    }));
}

export function createSingleEliminationNodes(
  stageId: string,
  tournamentId: string,
  seeds: TournamentParticipantSeed[],
  bracketSize?: number
): BracketNode[] {
  const size = resolveEliminationBracketSize(seeds.length, 2, bracketSize);
  const bracketOrder = seedOrdering(size);
  const seedSlots = bracketOrder.map(
    (slotSeed) => seeds.find((seed) => seed.seed === slotSeed) ?? null
  );
  const nodes: BracketNode[] = [];
  const rounds = Math.log2(size);

  for (let round = 1; round <= rounds; round += 1) {
    const matchCount = size / 2 ** round;
    for (let match = 1; match <= matchCount; match += 1) {
      const id = `${stageId}-w-${round}-${match}`;
      const racerAId = round === 1 ? (seedSlots[(match - 1) * 2]?.racerId ?? null) : null;
      const racerBId = round === 1 ? (seedSlots[(match - 1) * 2 + 1]?.racerId ?? null) : null;
      const nextNodeId =
        round < rounds ? `${stageId}-w-${round + 1}-${Math.ceil(match / 2)}` : null;

      nodes.push({
        id,
        tournamentId,
        stageId,
        roundNumber: round,
        matchNumber: match,
        slotLabel: `W${round}.${match}`,
        racerAId,
        racerBId,
        winnerRacerId: null,
        winnerToNodeId: nextNodeId,
        loserToNodeId: null,
        state: racerAId && racerBId ? "ready" : racerAId || racerBId ? "bye" : "pending",
        meta: {
          winnerSlot: match % 2 === 1 ? "a" : "b",
          bracket: "winners"
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  return sweepSingleEliminationByes(nodes);
}

function assignToNode(
  nodes: BracketNode[],
  nodeId: string,
  slot: "a" | "b",
  racerId: string | null
): BracketNode[] {
  return nodes.map((node): BracketNode => {
    if (node.id !== nodeId) {
      return node;
    }

    return {
      ...node,
      racerAId: slot === "a" ? racerId : node.racerAId,
      racerBId: slot === "b" ? racerId : node.racerBId,
      state:
        racerId && (slot === "a" ? node.racerBId : node.racerAId) ? ("ready" as const) : node.state,
      updatedAt: new Date().toISOString()
    };
  });
}

function canNodeReceiveAnotherParticipant(nodes: BracketNode[], nodeId: string): boolean {
  const sourceNodes = nodes.filter((candidate) => candidate.winnerToNodeId === nodeId);
  if (sourceNodes.length === 0) {
    return false;
  }

  return sourceNodes.some(
    (sourceNode) =>
      sourceNode.winnerRacerId == null && Boolean(sourceNode.racerAId ?? sourceNode.racerBId)
  );
}

function sweepSingleEliminationByes(nodes: BracketNode[]): BracketNode[] {
  let next = [...nodes];
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of next) {
      // Once a bye already has a winner recorded, its auto-advance has been handled and should
      // not be replayed on the next pass or the loop will never settle for uneven brackets.
      if (node.state === "finished" || node.winnerRacerId || !node.winnerToNodeId) {
        continue;
      }

      const loneRacer =
        node.racerAId && !node.racerBId
          ? node.racerAId
          : node.racerBId && !node.racerAId
            ? node.racerBId
            : null;
      if (!loneRacer || canNodeReceiveAnotherParticipant(next, node.id)) {
        continue;
      }

      changed = true;
      next = next.map(
        (candidate): BracketNode =>
          candidate.id === node.id
            ? {
                ...candidate,
                state: "bye" as const,
                winnerRacerId: loneRacer,
                updatedAt: new Date().toISOString()
              }
            : candidate
      );

      const sourceMeta = node.meta as EliminationRouting;
      // Propagate auto-advances until every downstream match reflects the latest bye outcomes.
      next = assignToNode(next, node.winnerToNodeId, sourceMeta.winnerSlot ?? "a", loneRacer);
    }
  }

  return next.map((node): BracketNode => {
    if (node.state !== "pending" && node.state !== "bye") {
      return node;
    }
    if (node.racerAId && node.racerBId) {
      return {
        ...node,
        state: "ready" as const
      };
    }
    return node;
  });
}

export function advanceSingleElimination(
  nodes: BracketNode[],
  matchId: string,
  winnerRacerId: string
): BracketNode[] {
  const source = nodes.find((node) => node.id === matchId);
  if (!source) {
    throw new Error(`Could not find match ${matchId}`);
  }

  const routing = source.meta as EliminationRouting;
  let next: BracketNode[] = nodes.map(
    (node): BracketNode =>
      node.id === matchId
        ? {
            ...node,
            winnerRacerId,
            state: "finished" as const,
            updatedAt: new Date().toISOString()
          }
        : node
  );

  if (source.winnerToNodeId) {
    next = assignToNode(next, source.winnerToNodeId, routing.winnerSlot ?? "a", winnerRacerId);
  }

  return sweepSingleEliminationByes(next);
}

function losersRoundMatchCount(size: number, round: number): number {
  if (round === 1) {
    return Math.max(1, size / 4);
  }
  return Math.max(1, size / 2 ** (Math.floor(round / 2) + 1));
}

export function createDoubleEliminationNodes(
  stageId: string,
  tournamentId: string,
  seeds: TournamentParticipantSeed[],
  bracketSize?: number
): BracketNode[] {
  const size = resolveEliminationBracketSize(seeds.length, 4, bracketSize);
  const rounds = Math.log2(size);
  const winnersStageId = `${stageId}-winners`;
  // Build the winners bracket first, then rewire it into one flattened node graph for persistence.
  const winnersNodes = createSingleEliminationNodes(winnersStageId, tournamentId, seeds).map(
    (node) => {
      const round = node.roundNumber;
      const loserRound = round === 1 ? 1 : round * 2 - 2;
      const loserTarget =
        loserRound <= rounds * 2 - 2
          ? `${stageId}-l-${loserRound}-${round === 1 ? Math.ceil(node.matchNumber / 2) : node.matchNumber}`
          : null;
      return {
        ...node,
        id: node.id.replace(winnersStageId, stageId),
        stageId,
        slotLabel: node.slotLabel.replace("W", "WB"),
        winnerToNodeId:
          round < rounds
            ? `${stageId}-w-${round + 1}-${Math.ceil(node.matchNumber / 2)}`
            : `${stageId}-gf-1`,
        loserToNodeId: loserTarget,
        meta: {
          winnerSlot: round < rounds ? (node.matchNumber % 2 === 1 ? "a" : "b") : "a",
          loserSlot: round === 1 ? (node.matchNumber % 2 === 1 ? "a" : "b") : "b",
          bracket: "winners"
        }
      };
    }
  );

  const losersNodes: BracketNode[] = [];
  for (let round = 1; round <= rounds * 2 - 2; round += 1) {
    const matchCount = losersRoundMatchCount(size, round);
    for (let match = 1; match <= matchCount; match += 1) {
      const id = `${stageId}-l-${round}-${match}`;
      const nextNodeId =
        round === rounds * 2 - 2
          ? `${stageId}-gf-1`
          : round % 2 === 1
            ? `${stageId}-l-${round + 1}-${match}`
            : `${stageId}-l-${round + 1}-${Math.ceil(match / 2)}`;

      losersNodes.push({
        id,
        tournamentId,
        stageId,
        roundNumber: round,
        matchNumber: match,
        slotLabel: `LB${round}.${match}`,
        racerAId: null,
        racerBId: null,
        winnerRacerId: null,
        winnerToNodeId: nextNodeId,
        loserToNodeId: null,
        state: "pending",
        meta: {
          winnerSlot:
            round === rounds * 2 - 2 ? "b" : round % 2 === 1 ? "a" : match % 2 === 1 ? "a" : "b",
          bracket: "losers"
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  const grandFinal: BracketNode[] = [
    {
      id: `${stageId}-gf-1`,
      tournamentId,
      stageId,
      roundNumber: rounds + 10,
      matchNumber: 1,
      slotLabel: "GF1",
      racerAId: null,
      racerBId: null,
      winnerRacerId: null,
      winnerToNodeId: null,
      loserToNodeId: null,
      state: "pending",
      meta: {
        bracket: "grand-final"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: `${stageId}-gf-2`,
      tournamentId,
      stageId,
      roundNumber: rounds + 11,
      matchNumber: 1,
      slotLabel: "GF2",
      racerAId: null,
      racerBId: null,
      winnerRacerId: null,
      winnerToNodeId: null,
      loserToNodeId: null,
      state: "pending",
      meta: {
        bracket: "reset"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  return [...winnersNodes, ...losersNodes, ...grandFinal];
}

export function advanceDoubleElimination(
  nodes: BracketNode[],
  matchId: string,
  winnerRacerId: string
): BracketNode[] {
  const source = nodes.find((node) => node.id === matchId);
  if (!source) {
    throw new Error(`Could not find match ${matchId}`);
  }

  const loserRacerId =
    source.racerAId === winnerRacerId ? (source.racerBId ?? null) : (source.racerAId ?? null);
  const routing = source.meta as EliminationRouting;

  let next: BracketNode[] = nodes.map(
    (node): BracketNode =>
      node.id === matchId
        ? {
            ...node,
            winnerRacerId,
            state: "finished" as const,
            updatedAt: new Date().toISOString()
          }
        : node
  );

  if (source.winnerToNodeId) {
    next = assignToNode(next, source.winnerToNodeId, routing.winnerSlot ?? "a", winnerRacerId);
  }

  if (source.loserToNodeId && loserRacerId) {
    next = assignToNode(next, source.loserToNodeId, routing.loserSlot ?? "b", loserRacerId);
  }

  if (source.id.endsWith("gf-1")) {
    const winnerFromWinners = source.racerAId === winnerRacerId;
    if (!winnerFromWinners) {
      // A losers-bracket finalist must beat the winners finalist twice, so we materialize the reset match.
      next = next.map(
        (node): BracketNode =>
          node.id === source.id.replace("gf-1", "gf-2")
            ? {
                ...node,
                racerAId: source.racerAId,
                racerBId: source.racerBId,
                state:
                  source.racerAId && source.racerBId ? ("ready" as const) : ("pending" as const),
                updatedAt: new Date().toISOString()
              }
            : node
      );
    }
  }

  return next.map((node): BracketNode => {
    if (node.state === "pending" && node.racerAId && node.racerBId) {
      return {
        ...node,
        state: "ready" as const
      };
    }
    return node;
  });
}

export function createRoundRobinMatches(seeds: TournamentParticipantSeed[]): RoundRobinMatch[] {
  const matches: RoundRobinMatch[] = [];
  for (let index = 0; index < seeds.length; index += 1) {
    for (let opponent = index + 1; opponent < seeds.length; opponent += 1) {
      matches.push({
        id: nanoid(),
        racerAId: seeds[index].racerId,
        racerBId: seeds[opponent].racerId,
        winnerRacerId: null,
        scoreLabel: null
      });
    }
  }
  return matches;
}

export function computeRoundRobinStandings(
  seeds: TournamentParticipantSeed[],
  matches: RoundRobinMatch[]
): RoundRobinStanding[] {
  const table = new Map<string, Omit<RoundRobinStanding, "rank">>();
  for (const seed of seeds) {
    table.set(seed.racerId, {
      racerId: seed.racerId,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0
    });
  }

  for (const match of matches) {
    if (!match.winnerRacerId) {
      continue;
    }

    const loserId = match.winnerRacerId === match.racerAId ? match.racerBId : match.racerAId;
    const winner = table.get(match.winnerRacerId);
    const loser = table.get(loserId);
    if (!winner || !loser) {
      continue;
    }

    winner.played += 1;
    winner.wins += 1;
    winner.pointsFor += 1;
    loser.played += 1;
    loser.losses += 1;
    loser.pointsAgainst += 1;
  }

  return [...table.values()]
    .sort((left, right) => {
      if (right.wins !== left.wins) return right.wins - left.wins;
      const rightDiff = right.pointsFor - right.pointsAgainst;
      const leftDiff = left.pointsFor - left.pointsAgainst;
      // If standings are otherwise tied, keep the higher original seed ahead for deterministic ordering.
      if (rightDiff !== leftDiff) return rightDiff - leftDiff;
      return (
        seeds.find((seed) => seed.racerId === left.racerId)!.seed -
        seeds.find((seed) => seed.racerId === right.racerId)!.seed
      );
    })
    .map((standing, index) => ({
      ...standing,
      rank: index + 1
    }));
}

export function createGroupsToSingleElimination(
  stageId: string,
  tournamentId: string,
  seeds: TournamentParticipantSeed[]
): {
  groupMatches: RoundRobinMatch[];
  finalsNodes: BracketNode[];
  groupAssignments: Record<string, string[]>;
} {
  const groupCount = seeds.length <= 8 ? 2 : 4;
  const groupAssignments: Record<string, string[]> = {};
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    groupAssignments[`Group ${String.fromCharCode(65 + groupIndex)}`] = [];
  }

  const orderedGroups = Object.keys(groupAssignments);
  seeds.forEach((seed, index) => {
    const groupName = orderedGroups[index % orderedGroups.length];
    groupAssignments[groupName].push(seed.racerId);
  });

  const groupMatches = Object.entries(groupAssignments).flatMap(([groupName, racerIds]) =>
    createRoundRobinMatches(seeds.filter((seed) => racerIds.includes(seed.racerId))).map(
      (match) => ({
        ...match,
        scoreLabel: groupName
      })
    )
  );

  const placeholderSeeds = orderedGroups.flatMap((groupName, groupIndex) => [
    {
      racerId: `${groupName}-1`,
      label: `${groupName} Winner`,
      score: 0,
      seed: groupIndex * 2 + 1
    },
    {
      racerId: `${groupName}-2`,
      label: `${groupName} Runner-up`,
      score: 0,
      seed: groupIndex * 2 + 2
    }
  ]);

  // Finals start as labeled placeholders until group standings decide the real advancing racers.
  const finalsNodes = createSingleEliminationNodes(
    `${stageId}-finals`,
    tournamentId,
    placeholderSeeds
  ).map((node) => ({
    ...node,
    slotLabel: node.slotLabel.replace("W", "Finals")
  }));

  return {
    groupAssignments,
    groupMatches,
    finalsNodes
  };
}

export function createPresetBundle(
  preset: TournamentPreset,
  stageId: string,
  tournamentId: string,
  seeds: TournamentParticipantSeed[],
  options?: {
    bracketSize?: number;
  }
): {
  bracketNodes: BracketNode[];
  groupMatches: RoundRobinMatch[];
  standings: RoundRobinStanding[];
} {
  switch (preset) {
    case "single-elimination":
      return {
        bracketNodes: createSingleEliminationNodes(
          stageId,
          tournamentId,
          seeds,
          options?.bracketSize
        ),
        groupMatches: [],
        standings: []
      };
    case "double-elimination":
      return {
        bracketNodes: createDoubleEliminationNodes(
          stageId,
          tournamentId,
          seeds,
          options?.bracketSize
        ),
        groupMatches: [],
        standings: []
      };
    case "round-robin": {
      const groupMatches = createRoundRobinMatches(seeds);
      return {
        bracketNodes: [],
        groupMatches,
        standings: computeRoundRobinStandings(seeds, groupMatches)
      };
    }
    case "groups-to-single-elimination": {
      const grouped = createGroupsToSingleElimination(stageId, tournamentId, seeds);
      return {
        bracketNodes: grouped.finalsNodes,
        groupMatches: grouped.groupMatches,
        standings: []
      };
    }
    case "open-time-trial":
    default:
      return {
        bracketNodes: [],
        groupMatches: [],
        standings: []
      };
  }
}
