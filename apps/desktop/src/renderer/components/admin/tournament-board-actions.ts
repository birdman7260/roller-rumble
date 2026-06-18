import type { BracketNode, TournamentBundle } from "@roller-rumble/shared/types";

export function getRacerIdsWithIncompleteTournamentMatches(bundle: TournamentBundle): Set<string> {
  const racerIds = new Set<string>();

  for (const node of bundle.bracketNodes) {
    if (node.winnerRacerId || node.state === "finished") {
      continue;
    }

    if (node.racerAId) {
      racerIds.add(node.racerAId);
    }
    if (node.racerBId) {
      racerIds.add(node.racerBId);
    }
  }

  for (const match of bundle.groupMatches) {
    if (match.winnerRacerId) {
      continue;
    }

    if (match.racerAId) {
      racerIds.add(match.racerAId);
    }
    if (match.racerBId) {
      racerIds.add(match.racerBId);
    }
  }

  return racerIds;
}

function targetHasResult(nodes: BracketNode[], nodeId?: string | null): boolean {
  if (!nodeId) {
    return false;
  }

  return Boolean(nodes.find((node) => node.id === nodeId)?.winnerRacerId);
}

export function canFillByeNode(bundle: TournamentBundle, node: BracketNode): boolean {
  // The backend is the source of truth; this only hides BYE actions that are clearly unsafe.
  if (node.state !== "bye" || !node.winnerRacerId || (node.racerAId && node.racerBId)) {
    return false;
  }

  return !targetHasResult(bundle.bracketNodes, node.winnerToNodeId);
}

export function canUndoBracketNodeResult(bundle: TournamentBundle, node: BracketNode): boolean {
  if (!node.winnerRacerId || !node.racerAId || !node.racerBId || node.state !== "finished") {
    return false;
  }

  return (
    !targetHasResult(bundle.bracketNodes, node.winnerToNodeId) &&
    !targetHasResult(bundle.bracketNodes, node.loserToNodeId)
  );
}

export function getNodeRacerIds(node: BracketNode): string[] {
  return [node.racerAId, node.racerBId].filter((racerId): racerId is string => Boolean(racerId));
}

export function canRemoveRacerFromBracketNode(
  bundle: TournamentBundle,
  node: BracketNode,
  racerId: string
): boolean {
  if (node.state === "finished" || !getNodeRacerIds(node).includes(racerId)) {
    return false;
  }

  return getRacerIdsWithIncompleteTournamentMatches(bundle).has(racerId);
}
