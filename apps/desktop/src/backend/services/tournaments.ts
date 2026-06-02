import { nanoid } from "nanoid";
import type {
  EventRecord,
  RaceResult,
  Racer,
  BracketNode,
  TournamentBracketLayoutMode,
  TournamentBracketSize,
  TournamentBundle,
  TournamentParticipantSeed,
  TournamentPreset,
  TournamentRecord,
  TournamentStage
} from "@goldsprints/shared/types";
import { nowIso } from "@goldsprints/shared/utils";
import {
  advanceDoubleElimination,
  advanceSingleElimination,
  buildSeeds,
  createPresetBundle
} from "./competition";

export const TOURNAMENT_SELF_OPT_OUT_SETTING_KEY = "selfOptOutRacerIds";
export const TOURNAMENT_ADMIN_REMOVED_SETTING_KEY = "adminRemovedRacerIds";

export interface TournamentRacerReplacementResult {
  bundle: TournamentBundle;
  replacedIn: "bracket" | "matches" | "none";
  replacementType: "racer" | "bye";
}

type TournamentRemovalReason = "self-opt-out" | "admin-removed";

function includesRacer(node: BracketNode, racerId: string): boolean {
  return node.racerAId === racerId || node.racerBId === racerId;
}

function replaceSeed(
  seeds: TournamentParticipantSeed[],
  optedOutRacerId: string,
  replacementSeed: TournamentParticipantSeed | null
): TournamentParticipantSeed[] {
  if (!replacementSeed) {
    return seeds.filter((seed) => seed.racerId !== optedOutRacerId);
  }

  return seeds.map((seed) =>
    seed.racerId === optedOutRacerId
      ? {
          ...replacementSeed,
          seed: seed.seed
        }
      : seed
  );
}

function addRacerIdToSetting(
  settings: Record<string, unknown>,
  settingKey: string,
  racerId: string
) {
  const existing = Array.isArray(settings[settingKey])
    ? settings[settingKey].filter((candidate): candidate is string => typeof candidate === "string")
    : [];

  return {
    ...settings,
    [settingKey]: [...new Set([...existing, racerId])]
  };
}

export function getTournamentSelfOptOutRacerIds(bundle: TournamentBundle): string[] {
  const rawOptOuts = bundle.tournament.settings[TOURNAMENT_SELF_OPT_OUT_SETTING_KEY];
  return Array.isArray(rawOptOuts)
    ? rawOptOuts.filter((candidate): candidate is string => typeof candidate === "string")
    : [];
}

export function getTournamentAdminRemovedRacerIds(bundle: TournamentBundle): string[] {
  const rawRemovals = bundle.tournament.settings[TOURNAMENT_ADMIN_REMOVED_SETTING_KEY];
  return Array.isArray(rawRemovals)
    ? rawRemovals.filter((candidate): candidate is string => typeof candidate === "string")
    : [];
}

export function getTournamentUnavailableReplacementRacerIds(bundle: TournamentBundle): string[] {
  return [
    ...new Set([
      ...getTournamentSelfOptOutRacerIds(bundle),
      ...getTournamentAdminRemovedRacerIds(bundle)
    ])
  ];
}

export function getTournamentParticipantIds(bundle: TournamentBundle): string[] {
  return [
    ...new Set(
      [
        ...bundle.seeds.map((seed) => seed.racerId),
        ...bundle.bracketNodes.flatMap((node) => [node.racerAId, node.racerBId]),
        ...bundle.groupMatches.flatMap((match) => [match.racerAId, match.racerBId])
      ].filter((racerId): racerId is string => Boolean(racerId))
    )
  ];
}

export function getTournamentRacerIdsWithIncompleteMatches(bundle: TournamentBundle): string[] {
  return [
    ...new Set(
      [
        ...bundle.bracketNodes
          .filter((node) => !node.winnerRacerId && node.state !== "finished")
          .flatMap((node) => [node.racerAId, node.racerBId]),
        ...bundle.groupMatches
          .filter((match) => !match.winnerRacerId)
          .flatMap((match) => [match.racerAId, match.racerBId])
      ].filter((racerId): racerId is string => Boolean(racerId))
    )
  ];
}

export function canAutomaticallyReplaceTournamentRacer(
  bundle: TournamentBundle,
  racerId: string
): boolean {
  const bracketNodesWithRacer = bundle.bracketNodes.filter((node) => includesRacer(node, racerId));
  if (bracketNodesWithRacer.length > 0) {
    return bracketNodesWithRacer.every(
      (node) => node.roundNumber === 1 && !node.winnerRacerId && node.state !== "finished"
    );
  }

  const matchesWithRacer = bundle.groupMatches.filter(
    (match) => match.racerAId === racerId || match.racerBId === racerId
  );
  if (matchesWithRacer.length > 0) {
    return matchesWithRacer.every((match) => !match.winnerRacerId);
  }

  return false;
}

function resolveNodeState(racerAId?: string | null, racerBId?: string | null) {
  if (racerAId && racerBId) {
    return "ready" as const;
  }
  if (racerAId || racerBId) {
    return "bye" as const;
  }
  return "pending" as const;
}

function getLoneRacerId(node: BracketNode): string | null {
  if (node.racerAId && !node.racerBId) {
    return node.racerAId;
  }
  if (node.racerBId && !node.racerAId) {
    return node.racerBId;
  }
  return null;
}

function getRemovalSettings(
  settings: Record<string, unknown>,
  racerId: string,
  reason: TournamentRemovalReason
): Record<string, unknown> {
  return addRacerIdToSetting(
    settings,
    reason === "admin-removed"
      ? TOURNAMENT_ADMIN_REMOVED_SETTING_KEY
      : TOURNAMENT_SELF_OPT_OUT_SETTING_KEY,
    racerId
  );
}

function advanceBracketByes(
  bundle: TournamentBundle,
  nodes: BracketNode[],
  nodeIds: string[],
  timestamp: string
): BracketNode[] {
  return nodeIds.reduce((nextNodes, nodeId) => {
    const node = nextNodes.find((candidate) => candidate.id === nodeId);
    const loneRacerId = node ? getLoneRacerId(node) : null;
    if (!node || !loneRacerId) {
      return nextNodes;
    }

    const advancedNodes =
      bundle.tournament.preset === "double-elimination"
        ? advanceDoubleElimination(nextNodes, nodeId, loneRacerId)
        : advanceSingleElimination(nextNodes, nodeId, loneRacerId);

    return advancedNodes.map((candidate) =>
      candidate.id === nodeId
        ? {
            ...candidate,
            state: "bye" as const,
            winnerRacerId: loneRacerId,
            updatedAt: timestamp
          }
        : candidate
    );
  }, nodes);
}

export function optOutTournamentRacer(input: {
  bundle: TournamentBundle;
  optedOutRacerId: string;
  removalReason?: TournamentRemovalReason;
  replacementSeed: TournamentParticipantSeed | null;
}): TournamentRacerReplacementResult | null {
  const { bundle, optedOutRacerId, removalReason = "self-opt-out", replacementSeed } = input;
  if (
    replacementSeed?.racerId === optedOutRacerId ||
    !bundle.seeds.some((seed) => seed.racerId === optedOutRacerId) ||
    (replacementSeed
      ? getTournamentParticipantIds(bundle).includes(replacementSeed.racerId)
      : false)
  ) {
    return null;
  }

  const timestamp = nowIso();
  const nextTournament = {
    ...bundle.tournament,
    settings: getRemovalSettings(bundle.tournament.settings, optedOutRacerId, removalReason),
    updatedAt: timestamp
  };
  const replacementSeeds = replaceSeed(bundle.seeds, optedOutRacerId, replacementSeed);
  const removalSeeds = replaceSeed(bundle.seeds, optedOutRacerId, null);
  const bracketNodesWithRacer = bundle.bracketNodes.filter((node) =>
    includesRacer(node, optedOutRacerId)
  );
  const unplayedBracketNodesWithRacer = bracketNodesWithRacer.filter(
    (node) => !node.winnerRacerId && node.state !== "finished"
  );

  if (unplayedBracketNodesWithRacer.length > 0) {
    const unplayedBracketNodeIds = new Set(unplayedBracketNodesWithRacer.map((node) => node.id));
    return {
      replacedIn: "bracket",
      replacementType: replacementSeed ? "racer" : "bye",
      bundle: {
        ...bundle,
        tournament: nextTournament,
        seeds: replacementSeed ? replacementSeeds : removalSeeds,
        bracketNodes: advanceBracketByes(
          bundle,
          bundle.bracketNodes.map((node) => {
            if (!unplayedBracketNodeIds.has(node.id)) {
              return node;
            }

            const racerAId =
              node.racerAId === optedOutRacerId
                ? (replacementSeed?.racerId ?? null)
                : node.racerAId;
            const racerBId =
              node.racerBId === optedOutRacerId
                ? (replacementSeed?.racerId ?? null)
                : node.racerBId;

            return {
              ...node,
              racerAId,
              racerBId,
              state: resolveNodeState(racerAId, racerBId),
              updatedAt: timestamp
            };
          }),
          replacementSeed ? [] : [...unplayedBracketNodeIds],
          timestamp
        )
      }
    };
  }

  if (bracketNodesWithRacer.length > 0) {
    return {
      replacedIn: "none",
      replacementType: "bye",
      bundle: {
        ...bundle,
        tournament: nextTournament,
        seeds: removalSeeds
      }
    };
  }

  const matchesWithRacer = bundle.groupMatches.filter(
    (match) => match.racerAId === optedOutRacerId || match.racerBId === optedOutRacerId
  );
  const unplayedMatchesWithRacer = matchesWithRacer.filter((match) => !match.winnerRacerId);
  if (matchesWithRacer.length === 0) {
    return null;
  }

  if (unplayedMatchesWithRacer.length === 0) {
    return {
      replacedIn: "none",
      replacementType: "bye",
      bundle: {
        ...bundle,
        tournament: nextTournament,
        seeds: removalSeeds
      }
    };
  }

  return {
    replacedIn: "matches",
    replacementType: replacementSeed ? "racer" : "bye",
    bundle: {
      ...bundle,
      tournament: nextTournament,
      seeds: replacementSeed ? replacementSeeds : removalSeeds,
      groupMatches: replacementSeed
        ? bundle.groupMatches.map((match) =>
            !match.winnerRacerId &&
            (match.racerAId === optedOutRacerId || match.racerBId === optedOutRacerId)
              ? {
                  ...match,
                  racerAId:
                    match.racerAId === optedOutRacerId ? replacementSeed.racerId : match.racerAId,
                  racerBId:
                    match.racerBId === optedOutRacerId ? replacementSeed.racerId : match.racerBId
                }
              : match
          )
        : bundle.groupMatches.filter(
            (match) =>
              match.winnerRacerId != null ||
              (match.racerAId !== optedOutRacerId && match.racerBId !== optedOutRacerId)
          )
    }
  };
}

function getRoutingSlot(value: unknown): "a" | "b" {
  return value === "b" ? "b" : "a";
}

function clearRoutedRacer(
  nodes: BracketNode[],
  nodeId: string,
  slot: "a" | "b",
  racerId: string,
  timestamp: string
): BracketNode[] {
  return nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    const racerAId = slot === "a" && node.racerAId === racerId ? null : node.racerAId;
    const racerBId = slot === "b" && node.racerBId === racerId ? null : node.racerBId;

    return {
      ...node,
      racerAId,
      racerBId,
      state: resolveNodeState(racerAId, racerBId),
      updatedAt: timestamp
    };
  });
}

function targetHasResult(nodes: BracketNode[], nodeId?: string | null): boolean {
  if (!nodeId) {
    return false;
  }

  return Boolean(nodes.find((node) => node.id === nodeId)?.winnerRacerId);
}

export function canFillBracketByeSlot(bundle: TournamentBundle, nodeId: string): boolean {
  const node = bundle.bracketNodes.find((candidate) => candidate.id === nodeId);
  if (node?.state !== "bye" || !node.winnerRacerId || (node.racerAId && node.racerBId)) {
    return false;
  }

  return !targetHasResult(bundle.bracketNodes, node.winnerToNodeId);
}

export function fillBracketByeSlot(input: {
  bundle: TournamentBundle;
  nodeId: string;
  replacementSeed: TournamentParticipantSeed;
}): TournamentBundle | null {
  const { bundle, nodeId, replacementSeed } = input;
  const source = bundle.bracketNodes.find((node) => node.id === nodeId);
  if (
    !source ||
    !canFillBracketByeSlot(bundle, nodeId) ||
    getTournamentParticipantIds(bundle).includes(replacementSeed.racerId)
  ) {
    return null;
  }

  const timestamp = nowIso();
  const routing = source.meta;
  let nextNodes = source.winnerToNodeId
    ? clearRoutedRacer(
        bundle.bracketNodes,
        source.winnerToNodeId,
        getRoutingSlot(routing.winnerSlot),
        source.winnerRacerId!,
        timestamp
      )
    : bundle.bracketNodes;

  nextNodes = nextNodes.map((node) => {
    if (node.id !== source.id) {
      return node;
    }

    const racerAId = node.racerAId ?? replacementSeed.racerId;
    const racerBId = node.racerAId ? replacementSeed.racerId : node.racerBId;

    return {
      ...node,
      racerAId,
      racerBId,
      winnerRacerId: null,
      state: resolveNodeState(racerAId, racerBId),
      updatedAt: timestamp
    };
  });

  return {
    ...bundle,
    tournament: {
      ...bundle.tournament,
      status: "active",
      updatedAt: timestamp
    },
    seeds: bundle.seeds.some((seed) => seed.racerId === replacementSeed.racerId)
      ? bundle.seeds
      : [...bundle.seeds, replacementSeed],
    bracketNodes: nextNodes
  };
}

export function undoBracketNodeResult(input: {
  bundle: TournamentBundle;
  nodeId: string;
}): TournamentBundle | null {
  const { bundle, nodeId } = input;
  const source = bundle.bracketNodes.find((node) => node.id === nodeId);
  if (!source?.winnerRacerId || source.state !== "finished") {
    return null;
  }

  if (
    targetHasResult(bundle.bracketNodes, source.winnerToNodeId) ||
    targetHasResult(bundle.bracketNodes, source.loserToNodeId)
  ) {
    return null;
  }

  const timestamp = nowIso();
  const loserRacerId =
    source.racerAId === source.winnerRacerId
      ? (source.racerBId ?? null)
      : (source.racerAId ?? null);
  const routing = source.meta;
  let nextNodes = bundle.bracketNodes.map((node) =>
    node.id === source.id
      ? {
          ...node,
          winnerRacerId: null,
          state: resolveNodeState(node.racerAId, node.racerBId),
          updatedAt: timestamp
        }
      : node
  );

  if (source.winnerToNodeId) {
    nextNodes = clearRoutedRacer(
      nextNodes,
      source.winnerToNodeId,
      getRoutingSlot(routing.winnerSlot),
      source.winnerRacerId,
      timestamp
    );
  }

  if (source.loserToNodeId && loserRacerId) {
    nextNodes = clearRoutedRacer(
      nextNodes,
      source.loserToNodeId,
      getRoutingSlot(routing.loserSlot),
      loserRacerId,
      timestamp
    );
  }

  if (source.id.endsWith("gf-1")) {
    nextNodes = nextNodes.map((node) =>
      node.id === source.id.replace("gf-1", "gf-2") && !node.winnerRacerId
        ? {
            ...node,
            racerAId: null,
            racerBId: null,
            state: "pending" as const,
            updatedAt: timestamp
          }
        : node
    );
  }

  return {
    ...bundle,
    tournament: {
      ...bundle.tournament,
      status: "active",
      updatedAt: timestamp
    },
    bracketNodes: nextNodes
  };
}

export function undoGroupMatchResult(input: {
  bundle: TournamentBundle;
  matchId: string;
}): TournamentBundle | null {
  const { bundle, matchId } = input;
  const match = bundle.groupMatches.find((candidate) => candidate.id === matchId);
  if (!match?.winnerRacerId || bundle.bracketNodes.some((node) => Boolean(node.winnerRacerId))) {
    return null;
  }

  const timestamp = nowIso();
  return {
    ...bundle,
    tournament: {
      ...bundle.tournament,
      status: "active",
      updatedAt: timestamp
    },
    groupMatches: bundle.groupMatches.map((candidate) =>
      candidate.id === matchId ? { ...candidate, winnerRacerId: null } : candidate
    )
  };
}

function resolveSeedField(
  seeds: ReturnType<typeof buildSeeds>,
  preset: TournamentPreset,
  bracketSize?: TournamentBracketSize
): {
  bracketSize?: TournamentBracketSize;
  selectedSeeds: ReturnType<typeof buildSeeds>;
} {
  if (preset !== "single-elimination" && preset !== "double-elimination") {
    return {
      selectedSeeds: seeds
    };
  }

  // A smaller chosen bracket trims the field to the top seeds, while a larger one leaves room
  // for byes so the board can match the event format the host wants to run.
  return {
    bracketSize,
    selectedSeeds: bracketSize ? seeds.slice(0, bracketSize) : seeds
  };
}

export class TournamentService {
  createTournamentBundle(input: {
    event: EventRecord;
    racers: Racer[];
    results: RaceResult[];
    name: string;
    preset: TournamentPreset;
    bracketSize?: TournamentBracketSize;
    bracketLayout?: TournamentBracketLayoutMode;
  }): TournamentBundle {
    const timestamp = nowIso();
    const tournamentId = nanoid();
    const baseStageId = `${tournamentId}-stage-1`;
    const eligibleSeeds = buildSeeds(input.racers, input.results);
    const seededField = resolveSeedField(eligibleSeeds, input.preset, input.bracketSize);
    const presetBundle = createPresetBundle(
      input.preset,
      baseStageId,
      tournamentId,
      seededField.selectedSeeds,
      {
        bracketSize: seededField.bracketSize
      }
    );

    const tournament: TournamentRecord = {
      id: tournamentId,
      eventId: input.event.id,
      name: input.name,
      preset: input.preset,
      status: "active",
      settings: {
        seedSource: "event-results",
        eligibleRacerCount: eligibleSeeds.length,
        seedCount: seededField.selectedSeeds.length,
        bracketSize: seededField.bracketSize ?? null,
        bracketLayout: input.bracketLayout ?? "auto"
      },
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const stages: TournamentStage[] =
      input.preset === "groups-to-single-elimination"
        ? [
            {
              id: baseStageId,
              tournamentId,
              kind: "groups",
              name: "Group Stage",
              order: 1,
              settings: {},
              createdAt: timestamp,
              updatedAt: timestamp
            },
            {
              id: `${baseStageId}-finals`,
              tournamentId,
              kind: "elimination",
              name: "Finals Bracket",
              order: 2,
              settings: {},
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ]
        : [
            {
              id: baseStageId,
              tournamentId,
              kind: input.preset === "round-robin" ? "round-robin" : "elimination",
              name:
                input.preset === "single-elimination"
                  ? "Single Elimination"
                  : input.preset === "double-elimination"
                    ? "Double Elimination"
                    : input.preset === "round-robin"
                      ? "Standings"
                      : "Tournament",
              order: 1,
              settings: {},
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ];

    return {
      tournament,
      stages,
      bracketNodes: presetBundle.bracketNodes,
      groupMatches: presetBundle.groupMatches,
      standings: presetBundle.standings,
      seeds: seededField.selectedSeeds
    };
  }
}
