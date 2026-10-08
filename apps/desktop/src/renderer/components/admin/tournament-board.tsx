import { useReducer } from "react";
import type {
  AppSnapshot,
  BracketNode,
  TournamentBundle,
  TournamentQueueEntry,
  TournamentByeFillOptionsResponse,
  TournamentRacerRemovalOptionsResponse
} from "@roller-rumble/shared/types";
import { Button, EmptyState, Modal, SearchableSelect } from "@roller-rumble/shared-ui";
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

/**
 * Pin a ready match to race next, or clear its pin. Unlike staging, this stays available while
 * another race is staged or on the bikes: the pinned match goes on once the bikes are free.
 */
function PinUpNextButton({
  entry,
  onPinUpNext
}: {
  entry: TournamentQueueEntry;
  onPinUpNext: (matchId: string | null) => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={() => {
        onPinUpNext(entry.pinnedUpNext ? null : entry.matchId);
      }}
    >
      {entry.pinnedUpNext ? "Clear Up Next" : "Stage Next"}
    </Button>
  );
}

/** The match's `tournament queue` entry when the host can pin it up next: ready, not yet staged. */
function findPinnableQueueEntry(
  snapshot: AppSnapshot,
  matchId: string | undefined
): TournamentQueueEntry | null {
  const entry = snapshot.tournamentQueue.find((candidate) => candidate.matchId === matchId);
  return entry?.status === "ready" ? entry : null;
}

function TournamentMatchActionsModal({
  busy,
  bundle,
  capabilities,
  menuActionCount,
  menuNode,
  menuPinnableEntry,
  onPinUpNext,
  onStageMatch,
  onUndoMatch,
  openByeFillModal,
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
  /** The menu match's place in the `tournament queue`, when it can be pinned up next. */
  menuPinnableEntry: TournamentQueueEntry | null;
  onPinUpNext?: (matchId: string | null) => void;
  onStageMatch?: (nodeId: string) => void;
  onUndoMatch?: (nodeId: string) => void;
  openByeFillModal: (nodeId: string) => Promise<void>;
  openRemoveDialog: (nodeId: string, racerId: string) => Promise<void>;
  removableRacerIds: string[];
  setState: (patch: Partial<TournamentBoardState>) => void;
  snapshot: AppSnapshot;
}) {
  const { canFillMenuNode, canStageMatches, canStageMenuNode, canUndoMenuNode } = capabilities;

  function closeMenu(): void {
    setState({ menuNodeId: null });
  }

  return (
    <Modal
      open
      className="tournament-action-modal"
      eyebrow={menuNode.slotLabel}
      title={getNodeMatchupLabel(snapshot, bundle, menuNode)}
      dismissOnBackdropClick
      onDismiss={closeMenu}
      actions={
        <Button variant="ghost" onClick={closeMenu}>
          Close
        </Button>
      }
    >
      {menuActionCount === 0 ? (
        <p className="muted">No admin actions are available for this match yet.</p>
      ) : (
        <div className="tournament-action-modal__action-list">
          {canStageMenuNode ? (
            <Button
              disabled={!canStageMatches}
              onClick={() => {
                closeMenu();
                onStageMatch?.(menuNode.id);
              }}
            >
              Stage Match
            </Button>
          ) : null}
          {menuPinnableEntry ? (
            <PinUpNextButton
              entry={menuPinnableEntry}
              onPinUpNext={(matchId) => {
                closeMenu();
                onPinUpNext?.(matchId);
              }}
            />
          ) : null}
          {canUndoMenuNode ? (
            <Button
              variant="ghost"
              disabled={!canStageMatches}
              onClick={() => {
                closeMenu();
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
                fireAndForget(openByeFillModal(menuNode.id), "load BYE fill options");
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
    </Modal>
  );
}

function RemoveRacerModal({
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
    <Modal
      open
      className="tournament-action-modal"
      eyebrow="Remove racer"
      title={resolveTournamentRacerName(snapshot, bundle, removeDialog.racerId)}
      dismissDisabled={busy}
      onDismiss={closeTournamentDialogs}
      actions={
        <>
          <Button variant="ghost" disabled={busy} onClick={closeTournamentDialogs}>
            Cancel
          </Button>
          {removalOptions ? (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  fireAndForget(confirmRemoveRacer("bye"), "remove tournament racer with bye");
                }}
              >
                Make BYE
              </Button>
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
            </>
          ) : null}
        </>
      }
    >
      <p>
        {removeNode
          ? `${removeNode.slotLabel}: ${getNodeMatchupLabel(snapshot, bundle, removeNode)}`
          : "Choose how this racer's future tournament slot should be handled."}
      </p>
      {removalOptions ? (
        replacementCandidateOptions.length > 0 ? (
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
        )
      ) : (
        <p className="muted">{busy ? "Loading removal options..." : boardMessage}</p>
      )}
    </Modal>
  );
}

function ByeFillModal({
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
    <Modal
      open
      className="tournament-action-modal"
      eyebrow="Fill BYE slot"
      title={byeFillNode ? byeFillNode.slotLabel : "Tournament match"}
      dismissDisabled={busy}
      onDismiss={closeTournamentDialogs}
      actions={
        <>
          <Button variant="ghost" disabled={busy} onClick={closeTournamentDialogs}>
            Cancel
          </Button>
          {byeFillOptions ? (
            <Button
              disabled={busy || !selectedByeFillRacerId || byeFillCandidateOptions.length === 0}
              onClick={() => {
                fireAndForget(confirmFillByeSlot(), "fill tournament BYE slot");
              }}
            >
              Fill BYE Slot
            </Button>
          ) : null}
        </>
      }
    >
      <p>
        Choose an eligible racer to take the empty BYE side, or cancel and leave the match as-is.
      </p>
      {byeFillOptions ? (
        byeFillCandidateOptions.length > 0 ? (
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
        )
      ) : (
        <p className="muted">{busy ? "Loading BYE slot options..." : boardMessage}</p>
      )}
    </Modal>
  );
}

export function TournamentBracketBoard({
  snapshot,
  bundle,
  canStageMatches,
  hintText,
  expanded,
  onExpandedChange,
  onPinUpNext,
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
  /** Pin a match to race next, or clear the pin with `null`. */
  onPinUpNext?: (matchId: string | null) => void;
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
  const menuPinnableEntry = onPinUpNext ? findPinnableQueueEntry(snapshot, menuNode?.id) : null;
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
    (menuPinnableEntry ? 1 : 0) +
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

  async function openByeFillModal(nodeId: string): Promise<void> {
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
            : onPinUpNext
              ? "A tournament race is already staged. Click a ready matchup and choose Stage Next to race it after this one."
              : "A tournament race is already staged. Start it or unstage it before changing the bracket.")}
      </p>
      {boardMessage ? <p className="tournament-bracket__status">{boardMessage}</p> : null}
      <EliminationBracketView
        snapshot={snapshot}
        bundle={bundle}
        interactive={Boolean(onStageMatch ?? onUndoMatch ?? onPinUpNext)}
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
        <TournamentMatchActionsModal
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
          menuPinnableEntry={menuPinnableEntry}
          onPinUpNext={onPinUpNext}
          onStageMatch={onStageMatch}
          onUndoMatch={onUndoMatch}
          openByeFillModal={openByeFillModal}
          openRemoveDialog={openRemoveDialog}
          removableRacerIds={removableRacerIds}
          setState={setState}
          snapshot={snapshot}
        />
      ) : null}
      {removeDialog ? (
        <RemoveRacerModal
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
        <ByeFillModal
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
  onPinUpNext,
  onStageMatch,
  onUndoMatch
}: {
  snapshot: AppSnapshot;
  bundle: TournamentBundle;
  canStageMatches: boolean;
  /** Pin a match to race next, or clear the pin with `null`. */
  onPinUpNext?: (matchId: string | null) => void;
  onStageMatch: (matchId: string) => void;
  onUndoMatch?: (matchId: string) => void;
}) {
  if (bundle.groupMatches.length === 0) {
    return null;
  }

  return (
    <div className="stack-md">
      <div className="list">
        {bundle.groupMatches.map((match) => {
          const pinnableEntry = onPinUpNext ? findPinnableQueueEntry(snapshot, match.id) : null;
          return (
            <div key={match.id} className="list-row tournament-match-row">
              <div>
                <strong>
                  {resolveTournamentRacerName(snapshot, bundle, match.racerAId)} vs{" "}
                  {resolveTournamentRacerName(snapshot, bundle, match.racerBId)}
                </strong>
                <p>
                  {match.scoreLabel ?? "Tournament match"}
                  {pinnableEntry?.pinnedUpNext ? " · Pinned up next" : ""}
                </p>
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
                  <>
                    {pinnableEntry && onPinUpNext ? (
                      <PinUpNextButton entry={pinnableEntry} onPinUpNext={onPinUpNext} />
                    ) : null}
                    <Button
                      variant="ghost"
                      disabled={!canStageMatches}
                      onClick={() => {
                        onStageMatch(match.id);
                      }}
                    >
                      Stage Match
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
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
