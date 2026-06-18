import { useReducer } from "react";
import type {
  AppSnapshot,
  BracketNode,
  TournamentBundle,
  TournamentByeFillOptionsResponse,
  TournamentRacerRemovalOptionsResponse
} from "@roller-rumble/shared/types";
import { Button, EmptyState, SearchableSelect } from "@roller-rumble/shared-ui";
import { resolveTournamentRacerName } from "../../lib/admin-competition";
import {
  fetchTournamentByeFillOptions,
  fetchTournamentRacerRemovalOptions,
  fillTournamentByeSlot,
  removeRacerFromTournament
} from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";
import {
  EliminationBracketView,
  type BracketPresentationRequest
} from "../elimination-bracket-view";
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

interface TournamentBoardState {
  boardMessage: string | null;
  busy: boolean;
  byeFillDialog: { nodeId: string } | null;
  byeFillOptions: TournamentByeFillOptionsResponse | null;
  menuNodeId: string | null;
  removalOptions: TournamentRacerRemovalOptionsResponse | null;
  removeDialog: {
    nodeId: string;
    racerId: string;
  } | null;
  selectedByeFillRacerId: string;
  selectedReplacementRacerId: string;
}

const initialTournamentBoardState: TournamentBoardState = {
  boardMessage: null,
  busy: false,
  byeFillDialog: null,
  byeFillOptions: null,
  menuNodeId: null,
  removalOptions: null,
  removeDialog: null,
  selectedByeFillRacerId: "",
  selectedReplacementRacerId: ""
};

function tournamentBoardReducer(
  state: TournamentBoardState,
  patch: Partial<TournamentBoardState>
): TournamentBoardState {
  return { ...state, ...patch };
}

function TournamentMatchActionPopover({
  busy,
  bundle,
  capabilities,
  menuActionCount,
  menuNode,
  onStageMatch,
  onUndoMatch,
  openByeFillDialog,
  openRemoveDialog,
  removableRacerIds,
  setState,
  snapshot
}: {
  busy: boolean;
  bundle: TournamentBundle;
  capabilities: {
    canFillMenuNode: boolean;
    canStageMatches: boolean;
    canStageMenuNode: boolean;
    canUndoMenuNode: boolean;
  };
  menuActionCount: number;
  menuNode: BracketNode;
  onStageMatch?: (nodeId: string) => void;
  onUndoMatch?: (nodeId: string) => void;
  openByeFillDialog: (nodeId: string) => Promise<void>;
  openRemoveDialog: (nodeId: string, racerId: string) => Promise<void>;
  removableRacerIds: string[];
  setState: (patch: Partial<TournamentBoardState>) => void;
  snapshot: AppSnapshot;
}) {
  const { canFillMenuNode, canStageMatches, canStageMenuNode, canUndoMenuNode } = capabilities;

  return (
    <dialog className="tournament-match-action-popover" open>
      <button
        className="tournament-match-action-popover__backdrop"
        type="button"
        aria-label="Close tournament match actions"
        onClick={() => {
          setState({ menuNodeId: null });
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
                  setState({ menuNodeId: null });
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
                  setState({ menuNodeId: null });
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
          <p className="muted">Clear the currently staged race before changing bracket matchups.</p>
        ) : null}
        <div className="button-row">
          <Button
            variant="ghost"
            onClick={() => {
              setState({ menuNodeId: null });
            }}
          >
            Close
          </Button>
        </div>
      </div>
    </dialog>
  );
}

function RemoveRacerDialog({
  boardMessage,
  bundle,
  busy,
  closeTournamentDialogs,
  confirmRemoveRacer,
  removalOptions,
  removeDialog,
  removeNode,
  replacementCandidateOptions,
  selectedReplacementRacerId,
  setState,
  snapshot
}: {
  boardMessage: string | null;
  bundle: TournamentBundle;
  busy: boolean;
  closeTournamentDialogs: () => void;
  confirmRemoveRacer: (replacementMode: "racer" | "bye") => Promise<void>;
  removalOptions: TournamentRacerRemovalOptionsResponse | null;
  removeDialog: { nodeId: string; racerId: string };
  removeNode: BracketNode | null;
  replacementCandidateOptions: { label: string; value: string }[];
  selectedReplacementRacerId: string;
  setState: (patch: Partial<TournamentBoardState>) => void;
  snapshot: AppSnapshot;
}) {
  return (
    <dialog className="tournament-action-modal" open>
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
                <label htmlFor="tournament-replacement-racer">
                  Replacement racer
                  <SearchableSelect
                    id="tournament-replacement-racer"
                    value={selectedReplacementRacerId}
                    options={replacementCandidateOptions}
                    onValueChange={(value) => {
                      setState({ selectedReplacementRacerId: value });
                    }}
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
                    busy || !selectedReplacementRacerId || replacementCandidateOptions.length === 0
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
                    fireAndForget(confirmRemoveRacer("bye"), "remove tournament racer with bye");
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
    </dialog>
  );
}

function ByeFillDialog({
  boardMessage,
  busy,
  byeFillCandidateOptions,
  byeFillNode,
  byeFillOptions,
  closeTournamentDialogs,
  confirmFillByeSlot,
  selectedByeFillRacerId,
  setState
}: {
  boardMessage: string | null;
  busy: boolean;
  byeFillCandidateOptions: { label: string; value: string }[];
  byeFillNode: BracketNode | null;
  byeFillOptions: TournamentByeFillOptionsResponse | null;
  closeTournamentDialogs: () => void;
  confirmFillByeSlot: () => Promise<void>;
  selectedByeFillRacerId: string;
  setState: (patch: Partial<TournamentBoardState>) => void;
}) {
  return (
    <dialog className="tournament-action-modal" open>
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
                <label htmlFor="tournament-bye-fill-racer">
                  Racer to add
                  <SearchableSelect
                    id="tournament-bye-fill-racer"
                    value={selectedByeFillRacerId}
                    options={byeFillCandidateOptions}
                    onValueChange={(value) => {
                      setState({ selectedByeFillRacerId: value });
                    }}
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
                  disabled={busy || !selectedByeFillRacerId || byeFillCandidateOptions.length === 0}
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
    </dialog>
  );
}

export function TournamentBracketBoard({
  snapshot,
  bundle,
  canStageMatches,
  hintText,
  expanded,
  onExpandedChange,
  onStageMatch,
  onUndoMatch,
  presentationRequest,
  showViewportControls = true
}: {
  snapshot: AppSnapshot;
  bundle: TournamentBundle;
  canStageMatches: boolean;
  hintText?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onStageMatch?: (nodeId: string) => void;
  onUndoMatch?: (nodeId: string) => void;
  presentationRequest?: BracketPresentationRequest | null;
  showViewportControls?: boolean;
}) {
  const [state, setState] = useReducer(tournamentBoardReducer, initialTournamentBoardState);
  const {
    boardMessage,
    busy,
    byeFillDialog,
    byeFillOptions,
    menuNodeId,
    removalOptions,
    removeDialog,
    selectedByeFillRacerId,
    selectedReplacementRacerId
  } = state;
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
    setState({
      byeFillDialog: null,
      byeFillOptions: null,
      menuNodeId: null,
      removalOptions: null,
      removeDialog: null,
      selectedByeFillRacerId: "",
      selectedReplacementRacerId: ""
    });
  }

  async function openRemoveDialog(nodeId: string, racerId: string): Promise<void> {
    setState({
      boardMessage: null,
      busy: true,
      menuNodeId: null,
      removalOptions: null,
      removeDialog: { nodeId, racerId },
      selectedReplacementRacerId: ""
    });

    try {
      setState({
        removalOptions: await fetchTournamentRacerRemovalOptions(bundle.tournament.id, racerId)
      });
    } catch (error) {
      setState({
        boardMessage:
          error instanceof Error ? error.message : "Could not load tournament removal options."
      });
    } finally {
      setState({ busy: false });
    }
  }

  async function confirmRemoveRacer(replacementMode: "racer" | "bye"): Promise<void> {
    if (!removeDialog || !removalOptions) {
      return;
    }

    setState({ boardMessage: null, busy: true });

    try {
      const result = await removeRacerFromTournament(bundle.tournament.id, removalOptions.racerId, {
        replacementMode,
        replacementRacerId: replacementMode === "racer" ? selectedReplacementRacerId : null
      });
      closeTournamentDialogs();
      setState({ boardMessage: result.message });
    } catch (error) {
      setState({
        boardMessage: error instanceof Error ? error.message : "Could not remove tournament racer."
      });
    } finally {
      setState({ busy: false });
    }
  }

  async function openByeFillDialog(nodeId: string): Promise<void> {
    setState({
      boardMessage: null,
      busy: true,
      byeFillDialog: { nodeId },
      byeFillOptions: null,
      menuNodeId: null,
      selectedByeFillRacerId: ""
    });

    try {
      setState({
        byeFillOptions: await fetchTournamentByeFillOptions(bundle.tournament.id, nodeId)
      });
    } catch (error) {
      setState({
        boardMessage: error instanceof Error ? error.message : "Could not load BYE fill options."
      });
    } finally {
      setState({ busy: false });
    }
  }

  async function confirmFillByeSlot(): Promise<void> {
    if (!byeFillDialog || !selectedByeFillRacerId) {
      return;
    }

    setState({ boardMessage: null, busy: true });

    try {
      const result = await fillTournamentByeSlot(bundle.tournament.id, byeFillDialog.nodeId, {
        replacementRacerId: selectedByeFillRacerId
      });
      closeTournamentDialogs();
      setState({ boardMessage: result.message });
    } catch (error) {
      setState({
        boardMessage: error instanceof Error ? error.message : "Could not fill this BYE slot."
      });
    } finally {
      setState({ busy: false });
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
        presentationRequest={presentationRequest}
        showViewportControls={showViewportControls}
        onMatchSelect={(nodeId) => {
          setState({ boardMessage: null, menuNodeId: nodeId });
        }}
      />
      {menuNode ? (
        <TournamentMatchActionPopover
          busy={busy}
          bundle={bundle}
          capabilities={{
            canFillMenuNode,
            canStageMatches,
            canStageMenuNode,
            canUndoMenuNode
          }}
          menuActionCount={menuActionCount}
          menuNode={menuNode}
          onStageMatch={onStageMatch}
          onUndoMatch={onUndoMatch}
          openByeFillDialog={openByeFillDialog}
          openRemoveDialog={openRemoveDialog}
          removableRacerIds={removableRacerIds}
          setState={setState}
          snapshot={snapshot}
        />
      ) : null}
      {removeDialog ? (
        <RemoveRacerDialog
          boardMessage={boardMessage}
          bundle={bundle}
          busy={busy}
          closeTournamentDialogs={closeTournamentDialogs}
          confirmRemoveRacer={confirmRemoveRacer}
          removalOptions={removalOptions}
          removeDialog={removeDialog}
          removeNode={removeNode}
          replacementCandidateOptions={replacementCandidateOptions}
          selectedReplacementRacerId={selectedReplacementRacerId}
          setState={setState}
          snapshot={snapshot}
        />
      ) : null}
      {byeFillDialog ? (
        <ByeFillDialog
          boardMessage={boardMessage}
          busy={busy}
          byeFillCandidateOptions={byeFillCandidateOptions}
          byeFillNode={byeFillNode}
          byeFillOptions={byeFillOptions}
          closeTournamentDialogs={closeTournamentDialogs}
          confirmFillByeSlot={confirmFillByeSlot}
          selectedByeFillRacerId={selectedByeFillRacerId}
          setState={setState}
        />
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
