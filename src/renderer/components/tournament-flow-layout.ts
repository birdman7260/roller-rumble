import { Position } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import type {
  AppSnapshot,
  BracketNode,
  TournamentBracketLayoutMode,
  TournamentBundle
} from "@shared/types";
import {
  getTournamentBracketLayoutMode,
  getTournamentBracketSize,
  resolveTournamentRacerName
} from "../lib/admin-competition";

export type BracketFlowSide = "left" | "right" | "center";
export type ResolvedBracketLayout = "standard" | "center-converging";

export interface BracketFlowParticipant {
  avatarUrl: string | null;
  id: string | null;
  isWinner: boolean;
  name: string;
  resultText: string | null;
}

export interface BracketFlowNodeData extends Record<string, unknown> {
  appNodeId: string;
  canStage: boolean;
  highlighted: boolean;
  label: string;
  onStageMatch?: (nodeId: string) => void;
  participants: [BracketFlowParticipant, BracketFlowParticipant];
  roundLabel: string;
  side: BracketFlowSide;
  state: BracketNode["state"];
}

export interface BracketFlowEdgeData extends Record<string, unknown> {
  animationDurationMs?: number;
  animationKey?: string;
  completed: boolean;
  drawAnimated: boolean;
  highlighted: boolean;
  route: "winner" | "loser" | "reset";
}

export type BracketFlowNode = Node<BracketFlowNodeData, "tournamentMatch">;
export type BracketFlowEdge = Edge<BracketFlowEdgeData, "tournamentConnector">;

export interface BracketAdvancementEdgeAnimation {
  durationMs?: number;
  fromNodeId: string;
  key: string;
  toNodeId: string;
}

interface BuildBracketFlowOptions {
  animatedAdvancementEdge?: BracketAdvancementEdgeAnimation | null;
  highlightedNodeId?: string | null;
}

const NODE_WIDTH = 296;
const NODE_HEIGHT = 162;
const COLUMN_GAP = 356;
const ROW_GAP = 168;
const SECTION_GAP = 224;
const FLOW_NODE_ORIGIN: [0.5, 0.5] = [0.5, 0.5];

function sameParticipantSet(
  left: (string | null | undefined)[],
  right: (string | null | undefined)[]
): boolean {
  const leftIds = left.filter((value): value is string => Boolean(value)).sort();
  const rightIds = right.filter((value): value is string => Boolean(value)).sort();

  return (
    leftIds.length === rightIds.length && leftIds.every((value, index) => value === rightIds[index])
  );
}

interface NodePlacement {
  side: BracketFlowSide;
  x: number;
  y: number;
}

function getBracket(node: BracketNode): string {
  return typeof node.meta.bracket === "string" ? node.meta.bracket : "winners";
}

function getRoundLabel(node: BracketNode): string {
  const bracket = getBracket(node);
  if (bracket === "grand-final") {
    return "Grand Final";
  }
  if (bracket === "reset") {
    return "Reset Match";
  }
  if (bracket === "losers") {
    return `Losers ${node.roundNumber}`;
  }
  return `Winners ${node.roundNumber}`;
}

function getParticipantResult(node: BracketNode, racerId?: string | null): string | null {
  if (!racerId || node.winnerRacerId !== racerId) {
    return null;
  }

  return node.state === "bye" ? "BYE" : "ADV";
}

function getParticipant(
  snapshot: AppSnapshot,
  bundle: TournamentBundle,
  node: BracketNode,
  racerId?: string | null
): BracketFlowParticipant {
  const racer = racerId
    ? (snapshot.racers.find((entry) => entry.racer.id === racerId)?.racer ?? null)
    : null;

  return {
    avatarUrl: racer?.avatarUrl ?? null,
    id: racerId ?? null,
    isWinner: Boolean(racerId && node.winnerRacerId === racerId),
    name: resolveTournamentRacerName(snapshot, bundle, racerId),
    resultText: getParticipantResult(node, racerId)
  };
}

function getRoundOneMatchCount(nodes: BracketNode[]): number {
  return Math.max(1, nodes.filter((node) => node.roundNumber === 1).length || nodes.length);
}

function getStandardTreePlacement(
  node: BracketNode,
  roundOneMatchCount: number,
  xOffset = 0,
  yOffset = 0
): NodePlacement {
  const spread = ROW_GAP * 2 ** (node.roundNumber - 1);
  const totalHeight = roundOneMatchCount * ROW_GAP;

  return {
    side: "left",
    x: (node.roundNumber - 1) * COLUMN_GAP + xOffset,
    y: (node.matchNumber - 0.5) * spread - totalHeight / 2 + yOffset
  };
}

function getCenterConvergingPlacement(
  node: BracketNode,
  nodesInRound: Map<number, number>,
  totalRounds: number,
  roundOneMatchCount: number
): NodePlacement {
  if (totalRounds <= 1 || node.roundNumber === totalRounds) {
    return {
      side: "center",
      x: 0,
      y: 0
    };
  }

  const totalMatchesInRound = nodesInRound.get(node.roundNumber) ?? 1;
  const leftCount = Math.ceil(totalMatchesInRound / 2);
  const isLeftSide = node.matchNumber <= leftCount;
  const localMatchNumber = isLeftSide ? node.matchNumber : node.matchNumber - leftCount;
  const sideRoundOneMatchCount = Math.max(1, Math.ceil(roundOneMatchCount / 2));
  const spread = ROW_GAP * 2 ** (node.roundNumber - 1);
  const sideHeight = sideRoundOneMatchCount * ROW_GAP;

  return {
    side: isLeftSide ? "left" : "right",
    x: (isLeftSide ? -1 : 1) * (totalRounds - node.roundNumber) * COLUMN_GAP,
    y: (localMatchNumber - 0.5) * spread - sideHeight / 2
  };
}

function buildSingleTreePlacements(
  nodes: BracketNode[],
  layout: ResolvedBracketLayout
): Map<string, NodePlacement> {
  const placements = new Map<string, NodePlacement>();
  const roundOneMatchCount = getRoundOneMatchCount(nodes);
  const totalRounds = Math.max(...nodes.map((node) => node.roundNumber));
  const nodesInRound = new Map<number, number>();

  for (const node of nodes) {
    nodesInRound.set(node.roundNumber, (nodesInRound.get(node.roundNumber) ?? 0) + 1);
  }

  for (const node of nodes) {
    placements.set(
      node.id,
      layout === "center-converging"
        ? getCenterConvergingPlacement(node, nodesInRound, totalRounds, roundOneMatchCount)
        : getStandardTreePlacement(node, roundOneMatchCount)
    );
  }

  return placements;
}

function buildDoubleEliminationPlacements(nodes: BracketNode[]): Map<string, NodePlacement> {
  const placements = new Map<string, NodePlacement>();
  const winnersNodes = nodes.filter((node) => getBracket(node) === "winners");
  const losersNodes = nodes.filter((node) => getBracket(node) === "losers");
  const grandFinalNodes = nodes.filter((node) => {
    const bracket = getBracket(node);
    return bracket === "grand-final" || bracket === "reset";
  });

  const winnersRoundOneMatchCount = getRoundOneMatchCount(winnersNodes);
  const losersRoundOneMatchCount = getRoundOneMatchCount(losersNodes);
  const winnersHeight = winnersRoundOneMatchCount * ROW_GAP;
  const losersHeight = losersRoundOneMatchCount * ROW_GAP;

  // Double elimination reads best as two stacked ladders with a shared finals destination, so we
  // keep this format on a standard board rather than splitting it into a center-converging view.
  const winnersOffsetY = -(losersHeight / 2 + SECTION_GAP / 2);
  const losersOffsetY = winnersHeight / 2 + SECTION_GAP / 2;

  for (const node of winnersNodes) {
    placements.set(
      node.id,
      getStandardTreePlacement(node, winnersRoundOneMatchCount, 0, winnersOffsetY)
    );
  }

  for (const node of losersNodes) {
    placements.set(
      node.id,
      getStandardTreePlacement(node, losersRoundOneMatchCount, COLUMN_GAP * 0.65, losersOffsetY)
    );
  }

  const farthestWinnersX = Math.max(
    ...winnersNodes.map((node) => placements.get(node.id)?.x ?? 0),
    0
  );
  const farthestLosersX = Math.max(
    ...losersNodes.map((node) => placements.get(node.id)?.x ?? 0),
    0
  );
  const grandFinalX = Math.max(farthestWinnersX, farthestLosersX) + COLUMN_GAP;
  const centerY = (winnersOffsetY + losersOffsetY) / 2;

  grandFinalNodes
    .sort((left, right) => left.roundNumber - right.roundNumber)
    .forEach((node, index) => {
      placements.set(node.id, {
        side: "left",
        x: grandFinalX,
        y: centerY + index * ROW_GAP
      });
    });

  return placements;
}

export function findBracketNodeByParticipantIds(
  bundle: TournamentBundle,
  participantIds: string[],
  options?: {
    includeFinished?: boolean;
  }
): BracketNode | null {
  const includeFinished = options?.includeFinished ?? false;

  return (
    bundle.bracketNodes.find((node) => {
      if (!includeFinished && node.state === "finished") {
        return false;
      }

      return sameParticipantSet([node.racerAId, node.racerBId], participantIds);
    }) ?? null
  );
}

function getCurrentMatchNodeId(snapshot: AppSnapshot, bundle: TournamentBundle): string | null {
  const currentRace = snapshot.raceProjection.race;
  if (currentRace?.tournamentId !== bundle.tournament.id) {
    return null;
  }

  return (
    findBracketNodeByParticipantIds(
      bundle,
      currentRace.participants.map((participant) => participant.racerId)
    )?.id ?? null
  );
}

function getSourceHandle(side: BracketFlowSide): string {
  return side === "right" ? "out-left" : "out-right";
}

function getTargetHandle(side: BracketFlowSide, preferredSide?: "left" | "right"): string {
  if (side === "center") {
    return preferredSide === "right" ? "in-right" : "in-left";
  }

  return side === "right" ? "in-right" : "in-left";
}

function resolveEffectiveLayout(
  bundle: TournamentBundle,
  requestedLayout: TournamentBracketLayoutMode
): ResolvedBracketLayout {
  const hasLosersBracket = bundle.bracketNodes.some((node) => getBracket(node) === "losers");
  if (hasLosersBracket) {
    return "standard";
  }

  if (requestedLayout === "center-converging") {
    return "center-converging";
  }

  if (requestedLayout === "standard") {
    return "standard";
  }

  const bracketSize = getTournamentBracketSize(bundle) ?? bundle.seeds.length;

  // "Auto" keeps small brackets compact, but larger single-tree fields read better on a projector
  // when the finals live in the middle and the early rounds spread out to both sides.
  return bracketSize >= 8 ? "center-converging" : "standard";
}

export function buildBracketFlow(
  snapshot: AppSnapshot,
  bundle: TournamentBundle,
  interactive: boolean,
  options: BuildBracketFlowOptions = {}
): {
  currentMatchNodeId: string | null;
  edges: BracketFlowEdge[];
  effectiveLayout: ResolvedBracketLayout;
  nodes: BracketFlowNode[];
} {
  const requestedLayout = getTournamentBracketLayoutMode(bundle);
  const effectiveLayout = resolveEffectiveLayout(bundle, requestedLayout);
  const currentMatchNodeId = getCurrentMatchNodeId(snapshot, bundle);
  const effectiveHighlightedNodeId = options.highlightedNodeId ?? currentMatchNodeId;
  const animatedAdvancementEdge = options.animatedAdvancementEdge ?? null;
  const placements =
    bundle.tournament.preset === "double-elimination"
      ? buildDoubleEliminationPlacements(bundle.bracketNodes)
      : buildSingleTreePlacements(bundle.bracketNodes, effectiveLayout);

  const nodes = bundle.bracketNodes.map((node): BracketFlowNode => {
    const placement = placements.get(node.id) ?? { side: "left", x: 0, y: 0 };

    return {
      id: node.id,
      type: "tournamentMatch",
      position: {
        x: placement.x,
        y: placement.y
      },
      draggable: false,
      selectable: interactive,
      connectable: false,
      sourcePosition: placement.side === "right" ? Position.Left : Position.Right,
      targetPosition: placement.side === "right" ? Position.Right : Position.Left,
      data: {
        appNodeId: node.id,
        canStage: interactive && node.state === "ready" && Boolean(node.racerAId && node.racerBId),
        highlighted: effectiveHighlightedNodeId === node.id,
        label: node.slotLabel,
        onStageMatch: undefined,
        participants: [
          getParticipant(snapshot, bundle, node, node.racerAId),
          getParticipant(snapshot, bundle, node, node.racerBId)
        ],
        roundLabel: getRoundLabel(node),
        side: placement.side,
        state: node.state
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: BracketFlowEdge[] = [];

  for (const node of bundle.bracketNodes) {
    const sourceNode = nodeById.get(node.id);
    if (!sourceNode) {
      continue;
    }

    if (node.winnerToNodeId) {
      const targetNode = nodeById.get(node.winnerToNodeId);
      if (targetNode) {
        const drawAnimated =
          animatedAdvancementEdge?.fromNodeId === node.id &&
          animatedAdvancementEdge.toNodeId === node.winnerToNodeId;

        edges.push({
          id: `winner:${node.id}->${node.winnerToNodeId}`,
          type: "tournamentConnector",
          source: node.id,
          target: node.winnerToNodeId,
          sourceHandle: getSourceHandle(sourceNode.data.side),
          targetHandle: getTargetHandle(
            targetNode.data.side,
            sourceNode.data.side === "right" ? "right" : "left"
          ),
          data: {
            animationDurationMs: drawAnimated ? animatedAdvancementEdge.durationMs : undefined,
            animationKey: drawAnimated ? animatedAdvancementEdge.key : undefined,
            completed:
              Boolean(node.winnerRacerId) && (node.state === "finished" || node.state === "bye"),
            drawAnimated,
            highlighted:
              effectiveHighlightedNodeId === node.id ||
              effectiveHighlightedNodeId === node.winnerToNodeId,
            route: "winner"
          }
        });
      }
    }

    if (node.loserToNodeId) {
      const targetNode = nodeById.get(node.loserToNodeId);
      if (targetNode) {
        edges.push({
          id: `loser:${node.id}->${node.loserToNodeId}`,
          type: "tournamentConnector",
          source: node.id,
          target: node.loserToNodeId,
          sourceHandle: getSourceHandle(sourceNode.data.side),
          targetHandle: getTargetHandle(targetNode.data.side),
          data: {
            completed: Boolean(node.winnerRacerId) && node.state === "finished",
            drawAnimated: false,
            highlighted:
              effectiveHighlightedNodeId === node.id ||
              effectiveHighlightedNodeId === node.loserToNodeId,
            route: "loser"
          }
        });
      }
    }

    if (node.id.endsWith("gf-1")) {
      const resetNodeId = node.id.replace("gf-1", "gf-2");
      const resetNode = nodeById.get(resetNodeId);
      if (resetNode) {
        edges.push({
          id: `reset:${node.id}->${resetNodeId}`,
          type: "tournamentConnector",
          source: node.id,
          target: resetNodeId,
          sourceHandle: getSourceHandle(sourceNode.data.side),
          targetHandle: getTargetHandle(resetNode.data.side),
          data: {
            completed: node.state === "finished" && resetNode.data.state !== "pending",
            drawAnimated: false,
            highlighted:
              effectiveHighlightedNodeId === node.id || effectiveHighlightedNodeId === resetNodeId,
            route: "reset"
          }
        });
      }
    }
  }

  return {
    currentMatchNodeId,
    edges,
    effectiveLayout,
    nodes
  };
}

export function withStageCallbacks(
  nodes: BracketFlowNode[],
  onStageMatch?: (nodeId: string) => void
): BracketFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      onStageMatch
    }
  }));
}

export { FLOW_NODE_ORIGIN };
export { NODE_HEIGHT, NODE_WIDTH };
