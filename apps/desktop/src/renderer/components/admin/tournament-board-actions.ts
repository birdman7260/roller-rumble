import type { BracketNode, TournamentBundle } from "@goldsprints/shared/types";

export function getRacerIdsWithIncompleteTournamentMatches(bundle: TournamentBundle): Set<string> {
  return new Set(
    [
      ...bundle.bracketNodes
        .filter((node) => !node.winnerRacerId && node.state !== "finished")
        .flatMap((node) => [node.racerAId, node.racerBId]),
      ...bundle.groupMatches
        .filter((match) => !match.winnerRacerId)
        .flatMap((match) => [match.racerAId, match.racerBId])
    ].filter((racerId): racerId is string => Boolean(racerId))
  );
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
