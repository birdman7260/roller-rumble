import { useState } from "react";
import type {
  AppSnapshot,
  BracketNode,
  TournamentBundle,
  TournamentByeFillOptionsResponse,
  TournamentRacerRemovalOptionsResponse
} from "@goldsprints/shared/types";
import { Button, EmptyState, SearchableSelect } from "@goldsprints/shared-ui";
import { resolveTournamentRacerName } from "../../lib/admin-competition";
import {
  fetchTournamentByeFillOptions,
  fetchTournamentRacerRemovalOptions,
  fillTournamentByeSlot,
  removeRacerFromTournament
} from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";
import { EliminationBracketView } from "../elimination-bracket-view";
import {
  canFillByeNode,
  canRemoveRacerFromBracketNode,
  canUndoBracketNodeResult,
  getNodeRacerIds
} from "./tournament-board-actions";

function getNodeMatchupLabel(
  snapshot: AppSnapshot,
  bundle: TournamentBundle,
  node: BracketNode
): string {
  return `${resolveTournamentRacerName(
    snapshot,
    bundle,
    node.racerAId
  )} vs ${resolveTournamentRacerName(snapshot, bundle, node.racerBId)}`;
}

export function TournamentBracketBoard({
  snapshot,
  bundle,
  canStageMatches,
  hintText,
  expanded,
  onExpandedChange,
  onStageMatch,
  onUndoMatch
}: {
  snapshot: AppSnapshot;
  bundle: TournamentBundle;
  canStageMatches: boolean;
  hintText?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onStageMatch?: (nodeId: string) => void;
  onUndoMatch?: (nodeId: string) => void;
}) {
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null);
  const [removeDialog, setRemoveDialog] = useState<{
    nodeId: string;
    racerId: string;
  } | null>(null);
  const [removalOptions, setRemovalOptions] =
    useState<TournamentRacerRemovalOptionsResponse | null>(null);
  const [selectedReplacementRacerId, setSelectedReplacementRacerId] = useState("");
  const [byeFillDialog, setByeFillDialog] = useState<{ nodeId: string } | null>(null);
  const [byeFillOptions, setByeFillOptions] = useState<TournamentByeFillOptionsResponse | null>(
    null
  );
  const [selectedByeFillRacerId, setSelectedByeFillRacerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [boardMessage, setBoardMessage] = useState<string | null>(null);
  const menuNode = menuNodeId
    ? (bundle.bracketNodes.find((node) => node.id === menuNodeId) ?? null)
    : null;
  const removeNode = removeDialog
    ? (bundle.bracketNodes.find((node) => node.id === removeDialog.nodeId) ?? null)
    : null;
  const byeFillNode = byeFillDialog
    ? (bundle.bracketNodes.find((node) => node.id === byeFillDialog.nodeId) ?? null)
    : null;
  const removableRacerIds = menuNode
    ? getNodeRacerIds(menuNode).filter((racerId) =>
        canRemoveRacerFromBracketNode(bundle, menuNode, racerId)
      )
    : [];
  const canStageMenuNode = Boolean(
    onStageMatch && menuNode?.racerAId && menuNode.racerBId && menuNode.state === "ready"
  );
  const canUndoMenuNode = Boolean(
    menuNode && onUndoMatch && canUndoBracketNodeResult(bundle, menuNode)
  );
  const canFillMenuNode = menuNode ? canFillByeNode(bundle, menuNode) : false;
  const replacementCandidateOptions =
    removalOptions?.candidates.map((candidate) => ({
      value: candidate.racerId,
      label: `#${candidate.seed} ${candidate.label}`
    })) ?? [];
  const byeFillCandidateOptions =
    byeFillOptions?.candidates.map((candidate) => ({
      value: candidate.racerId,
      label: `#${candidate.seed} ${candidate.label}`
    })) ?? [];
  const menuActionCount =
    (canStageMenuNode ? 1 : 0) +
    (canUndoMenuNode ? 1 : 0) +
    (canFillMenuNode ? 1 : 0) +
    removableRacerIds.length;

  function closeTournamentDialogs(): void {
    setMenuNodeId(null);
    setRemoveDialog(null);
    setRemovalOptions(null);
    setSelectedReplacementRacerId("");
    setByeFillDialog(null);
    setByeFillOptions(null);
    setSelectedByeFillRacerId("");
  }

  async function openRemoveDialog(nodeId: string, racerId: string): Promise<void> {
    setMenuNodeId(null);
    setRemoveDialog({ nodeId, racerId });
    setRemovalOptions(null);
    setSelectedReplacementRacerId("");
    setBoardMessage(null);
    setBusy(true);

    try {
      setRemovalOptions(await fetchTournamentRacerRemovalOptions(bundle.tournament.id, racerId));
    } catch (error) {
      setBoardMessage(
        error instanceof Error ? error.message : "Could not load tournament removal options."
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemoveRacer(replacementMode: "racer" | "bye"): Promise<void> {
    if (!removeDialog || !removalOptions) {
      return;
    }

    setBusy(true);
    setBoardMessage(null);

    try {
      const result = await removeRacerFromTournament(bundle.tournament.id, removalOptions.racerId, {
        replacementMode,
        replacementRacerId: replacementMode === "racer" ? selectedReplacementRacerId : null
      });
      closeTournamentDialogs();
      setBoardMessage(result.message);
    } catch (error) {
      setBoardMessage(
        error instanceof Error ? error.message : "Could not remove tournament racer."
      );
    } finally {
      setBusy(false);
    }
  }

  async function openByeFillDialog(nodeId: string): Promise<void> {
    setMenuNodeId(null);
    setByeFillDialog({ nodeId });
    setByeFillOptions(null);
    setSelectedByeFillRacerId("");
    setBoardMessage(null);
    setBusy(true);

    try {
      setByeFillOptions(await fetchTournamentByeFillOptions(bundle.tournament.id, nodeId));
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "Could not load BYE fill options.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmFillByeSlot(): Promise<void> {
    if (!byeFillDialog || !selectedByeFillRacerId) {
      return;
    }

    setBusy(true);
    setBoardMessage(null);

    try {
      const result = await fillTournamentByeSlot(bundle.tournament.id, byeFillDialog.nodeId, {
        replacementRacerId: selectedByeFillRacerId
      });
      closeTournamentDialogs();
      setBoardMessage(result.message);
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "Could not fill this BYE slot.");
    } finally {
      setBusy(false);
    }
  }

  if (bundle.bracketNodes.length === 0) {
    return (
      <EmptyState
        title="Bracket is not ready yet"
        body="As tournament racers advance, the elimination board will populate here."
      />
    );
  }

  return (
    <div
      className={`stack-md tournament-bracket-board${
        expanded ? " tournament-bracket-board--expanded" : ""
      }`}
    >
      <p className="tournament-bracket__hint">
        {hintText ??
          (canStageMatches
            ? "Click any matchup in the bracket for staging and admin options."
            : "A tournament race is already staged. Start it or unstage it before changing the bracket.")}
      </p>
      {boardMessage ? <p className="tournament-bracket__status">{boardMessage}</p> : null}
      <EliminationBracketView
        snapshot={snapshot}
        bundle={bundle}
        interactive={Boolean(onStageMatch ?? onUndoMatch)}
        expandMode="container"
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        onMatchSelect={(nodeId) => {
          setBoardMessage(null);
          setMenuNodeId(nodeId);
        }}
      />
      {menuNode ? (
        <div className="tournament-match-action-popover" role="dialog" aria-modal="true">
          <button
            className="tournament-match-action-popover__backdrop"
            type="button"
            aria-label="Close tournament match actions"
            onClick={() => {
              setMenuNodeId(null);
            }}
          />
          <div className="tournament-match-action-popover__card">
            <div>
              <p className="eyebrow">{menuNode.slotLabel}</p>
              <h3>{getNodeMatchupLabel(snapshot, bundle, menuNode)}</h3>
            </div>
            {menuActionCount === 0 ? (
              <p className="muted">No admin actions are available for this match yet.</p>
            ) : (
              <div className="tournament-match-action-popover__actions">
                {canStageMenuNode ? (
                  <Button
                    disabled={!canStageMatches}
                    onClick={() => {
                      setMenuNodeId(null);
                      onStageMatch?.(menuNode.id);
                    }}
                  >
                    Stage Match
                  </Button>
                ) : null}
                {canUndoMenuNode ? (
                  <Button
                    variant="ghost"
                    disabled={!canStageMatches}
                    onClick={() => {
                      setMenuNodeId(null);
                      onUndoMatch?.(menuNode.id);
                    }}
                  >
                    Undo Result
                  </Button>
                ) : null}
                {canFillMenuNode ? (
                  <Button
                    variant="ghost"
                    disabled={!canStageMatches || busy}
                    onClick={() => {
                      fireAndForget(openByeFillDialog(menuNode.id), "load BYE fill options");
                    }}
                  >
                    Fill BYE Slot
                  </Button>
                ) : null}
                {removableRacerIds.map((racerId) => (
                  <Button
                    key={racerId}
                    variant="ghost"
                    disabled={!canStageMatches || busy}
                    onClick={() => {
                      fireAndForget(
                        openRemoveDialog(menuNode.id, racerId),
                        "load tournament racer removal options"
                      );
                    }}
                  >
                    Remove {resolveTournamentRacerName(snapshot, bundle, racerId)}
                  </Button>
                ))}
              </div>
            )}
            {!canStageMatches && menuActionCount > 0 ? (
              <p className="muted">
                Clear the currently staged race before changing bracket matchups.
              </p>
            ) : null}
            <div className="button-row">
              <Button
                variant="ghost"
                onClick={() => {
                  setMenuNodeId(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {removeDialog ? (
        <div className="tournament-action-modal" role="dialog" aria-modal="true">
          <div className="tournament-action-modal__card">
            <div>
              <p className="eyebrow">Remove racer</p>
              <h3>{resolveTournamentRacerName(snapshot, bundle, removeDialog.racerId)}</h3>
              <p>
                {removeNode
                  ? `${removeNode.slotLabel}: ${getNodeMatchupLabel(snapshot, bundle, removeNode)}`
                  : "Choose how this racer's future tournament slot should be handled."}
              </p>
            </div>
            <div className="stack-md">
              {removalOptions ? (
                <>
                  {replacementCandidateOptions.length > 0 ? (
                    <label>
                      Replacement racer
                      <SearchableSelect
                        value={selectedReplacementRacerId}
                        options={replacementCandidateOptions}
                        onValueChange={setSelectedReplacementRacerId}
                        placeholder="Search replacement racers"
                        disabled={busy}
                      />
                    </label>
                  ) : (
                    <p className="muted">No eligible replacement racers are available.</p>
                  )}
                  <div className="button-row">
                    <Button
                      disabled={
                        busy ||
                        !selectedReplacementRacerId ||
                        replacementCandidateOptions.length === 0
                      }
                      onClick={() => {
                        fireAndForget(
                          confirmRemoveRacer("racer"),
                          "remove tournament racer with replacement"
                        );
                      }}
                    >
                      Replace Racer
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        fireAndForget(
                          confirmRemoveRacer("bye"),
                          "remove tournament racer with bye"
                        );
                      }}
                    >
                      Make BYE
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={closeTournamentDialogs}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <p className="muted">{busy ? "Loading removal options..." : boardMessage}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {byeFillDialog ? (
        <div className="tournament-action-modal" role="dialog" aria-modal="true">
          <div className="tournament-action-modal__card">
            <div>
              <p className="eyebrow">Fill BYE slot</p>
              <h3>{byeFillNode ? byeFillNode.slotLabel : "Tournament match"}</h3>
              <p>
                Choose an eligible racer to take the empty BYE side, or cancel and leave the match
                as-is.
              </p>
            </div>
            <div className="stack-md">
              {byeFillOptions ? (
                <>
                  {byeFillCandidateOptions.length > 0 ? (
                    <label>
                      Racer to add
                      <SearchableSelect
                        value={selectedByeFillRacerId}
                        options={byeFillCandidateOptions}
                        onValueChange={setSelectedByeFillRacerId}
                        placeholder="Search eligible racers"
                        disabled={busy}
                        noResultsText="No eligible racers"
                      />
                    </label>
                  ) : (
                    <p className="muted">No eligible racers are available for this BYE slot.</p>
                  )}
                  <div className="button-row">
                    <Button
                      disabled={
                        busy || !selectedByeFillRacerId || byeFillCandidateOptions.length === 0
                      }
                      onClick={() => {
                        fireAndForget(confirmFillByeSlot(), "fill tournament BYE slot");
                      }}
                    >
                      Fill BYE Slot
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={closeTournamentDialogs}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <p className="muted">{busy ? "Loading BYE slot options..." : boardMessage}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TournamentGroupMatchBoard({
  snapshot,
  bundle,
  canStageMatches,
  onStageMatch,
  onUndoMatch
}: {
  snapshot: AppSnapshot;
  bundle: TournamentBundle;
  canStageMatches: boolean;
  onStageMatch: (matchId: string) => void;
  onUndoMatch?: (matchId: string) => void;
}) {
  if (bundle.groupMatches.length === 0) {
    return null;
  }

  return (
    <div className="stack-md">
      <div className="list">
        {bundle.groupMatches.map((match) => (
          <div key={match.id} className="list-row tournament-match-row">
            <div>
              <strong>
                {resolveTournamentRacerName(snapshot, bundle, match.racerAId)} vs{" "}
                {resolveTournamentRacerName(snapshot, bundle, match.racerBId)}
              </strong>
              <p>{match.scoreLabel ?? "Tournament match"}</p>
            </div>
            <div className="button-row">
              {match.winnerRacerId ? (
                <>
                  <span>
                    Winner: {resolveTournamentRacerName(snapshot, bundle, match.winnerRacerId)}
                  </span>
                  {onUndoMatch ? (
                    <Button
                      variant="ghost"
                      disabled={!canStageMatches}
                      onClick={() => {
                        onUndoMatch(match.id);
                      }}
                    >
                      Undo Result
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button
                  variant="ghost"
                  disabled={!canStageMatches}
                  onClick={() => {
                    onStageMatch(match.id);
                  }}
                >
                  Stage Match
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {bundle.tournament.preset === "round-robin" && bundle.standings.length > 0 ? (
        <div className="standings-grid">
          {bundle.standings.map((standing) => (
            <div key={standing.racerId} className="standing-row">
              <strong>#{standing.rank}</strong>
              <span>{resolveTournamentRacerName(snapshot, bundle, standing.racerId)}</span>
              <span>
                {standing.wins}-{standing.losses}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
