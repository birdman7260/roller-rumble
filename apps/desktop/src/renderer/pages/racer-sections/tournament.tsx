import type { AppSnapshot, TournamentBundle } from "@roller-rumble/shared/types";
import { Button, EmptyState, Panel } from "@roller-rumble/shared-ui";
import { AnimatePresence, m } from "framer-motion";
import type { MotionProps } from "framer-motion";
import type { ReactElement } from "react";
import { EliminationBracketView, type BracketPresentationRequest } from "../../components/elimination-bracket-view";
import { TournamentBracketBoard } from "../../components/admin/tournament-board";
import { getCurrentMatchNodeId } from "../../components/tournament-flow-layout";
import { resolveRacerName } from "../../lib/snapshot-display";
import { fireAndForget } from "../../lib/ui-actions";

function BracketFocusButton({
  bundle,
  liveSnapshot,
  reduceMotion,
  setBracketPresentationRequest
}: {
  bundle: TournamentBundle;
  liveSnapshot: AppSnapshot;
  reduceMotion: boolean;
  setBracketPresentationRequest: (
    updater: (previousRequest: BracketPresentationRequest | null) => BracketPresentationRequest
  ) => void;
}) {
  const currentMatchNodeId = getCurrentMatchNodeId(liveSnapshot, bundle);

  return (
    <Button
      variant="ghost"
      disabled={!currentMatchNodeId}
      onClick={() => {
        if (!currentMatchNodeId) {
          return;
        }

        setBracketPresentationRequest((previousRequest) => {
          const previousSequence = Number(previousRequest?.key.split(":").at(-1) ?? "0");
          const nextSequence = Number.isFinite(previousSequence) ? previousSequence + 1 : 1;
          return {
            durationMs: reduceMotion ? 0 : 900,
            key: `${bundle.tournament.id}:focus-current:${String(nextSequence)}`,
            maxZoom: 1.22,
            nodeIds: [currentMatchNodeId],
            padding: 0.95,
            type: "focus-node"
          };
        });
      }}
    >
      Focus Current
    </Button>
  );
}

function renderBracketFocusAction(
  bundle: TournamentBundle,
  liveSnapshot: AppSnapshot,
  reduceMotion: boolean,
  setBracketPresentationRequest: (
    updater: (previousRequest: BracketPresentationRequest | null) => BracketPresentationRequest
  ) => void
): ReactElement {
  return (
    <BracketFocusButton
      bundle={bundle}
      liveSnapshot={liveSnapshot}
      reduceMotion={reduceMotion}
      setBracketPresentationRequest={setBracketPresentationRequest}
    />
  );
}

function canShowTournamentBracket(bundle: TournamentBundle): boolean {
  return bundle.bracketNodes.length > 0;
}

export function TournamentTab({
  bracketExpanded,
  bracketPresentationRequest,
  expandedBracketTournament,
  expandedBracketTournamentId,
  liveSnapshot,
  onTournamentOptOut,
  reduceMotion,
  selectedRacerCanOptOutOfVisibleTournament,
  setBracketPresentationRequest,
  setExpandedBracketTournamentId,
  tournamentOptOutBusy,
  tournamentOptOutMessage,
  tournaments,
  visibleTournament,
  layoutTransition
}: {
  bracketExpanded: boolean;
  bracketPresentationRequest: BracketPresentationRequest | null;
  expandedBracketTournament: TournamentBundle | null;
  expandedBracketTournamentId: string | null;
  liveSnapshot: AppSnapshot;
  onTournamentOptOut: () => Promise<void>;
  reduceMotion: boolean;
  selectedRacerCanOptOutOfVisibleTournament: boolean;
  setBracketPresentationRequest: (
    updater: (previousRequest: BracketPresentationRequest | null) => BracketPresentationRequest
  ) => void;
  setExpandedBracketTournamentId: (tournamentId: string | null) => void;
  tournamentOptOutBusy: boolean;
  tournamentOptOutMessage: string | null;
  tournaments: TournamentBundle[];
  visibleTournament: TournamentBundle | null;
  layoutTransition: MotionProps["transition"];
}) {
  const panelAction =
    bracketExpanded && expandedBracketTournament
      ? renderBracketFocusAction(
          expandedBracketTournament,
          liveSnapshot,
          reduceMotion,
          setBracketPresentationRequest
        )
      : undefined;

  return (
    <m.div
      layout
      transition={layoutTransition}
      className={`racer-page-grid__card racer-page-grid__card--tournaments${
        bracketExpanded ? " racer-page-grid__card--bracket-expanded" : ""
      }`}
    >
      <Panel
        title={
          bracketExpanded && expandedBracketTournament
            ? expandedBracketTournament.tournament.name
            : "Tournament View"
        }
        actions={panelAction}
        className={`racer-page-grid__panel${
          bracketExpanded ? " racer-page-grid__panel--bracket-expanded" : ""
        }`}
      >
        {tournaments.length === 0 ? (
          <EmptyState
            title="No tournament active"
            body="When the hosts create a bracket, it will appear here with standings and matchups."
          />
        ) : bracketExpanded && expandedBracketTournament ? (
          <TournamentBracketBoard
            snapshot={liveSnapshot}
            bundle={expandedBracketTournament}
            canStageMatches={false}
            hintText="Follow the live elimination board here."
            expanded
            onExpandedChange={(expanded) => {
              setExpandedBracketTournamentId(
                expanded ? expandedBracketTournament.tournament.id : null
              );
            }}
            presentationRequest={bracketPresentationRequest}
            showViewportControls={false}
          />
        ) : (
          <div className="stack-md racer-tournaments">
            <AnimatePresence initial={false} mode="popLayout">
              {tournaments.map((bundle) => (
                <m.div
                  key={bundle.tournament.id}
                  layout
                  transition={layoutTransition}
                  className="tournament-card"
                >
                  <div className="list-row">
                    <div>
                      <strong>{bundle.tournament.name}</strong>
                      <p>{bundle.tournament.preset}</p>
                    </div>
                    <div className="button-row">
                      {canShowTournamentBracket(bundle)
                        ? renderBracketFocusAction(
                            bundle,
                            liveSnapshot,
                            reduceMotion,
                            setBracketPresentationRequest
                          )
                        : null}
                      {selectedRacerCanOptOutOfVisibleTournament &&
                      bundle.tournament.id === visibleTournament?.tournament.id ? (
                        <Button
                          variant="ghost"
                          disabled={tournamentOptOutBusy}
                          onClick={() => {
                            fireAndForget(onTournamentOptOut(), "opt out of tournament");
                          }}
                        >
                          {tournamentOptOutBusy ? "Opting out..." : "Opt out"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {tournamentOptOutMessage ? <p>{tournamentOptOutMessage}</p> : null}
                  {canShowTournamentBracket(bundle) ? (
                    <EliminationBracketView
                      snapshot={liveSnapshot}
                      bundle={bundle}
                      expandMode="container"
                      expanded={expandedBracketTournamentId === bundle.tournament.id}
                      onExpandedChange={(expanded) => {
                        setExpandedBracketTournamentId(expanded ? bundle.tournament.id : null);
                      }}
                      presentationRequest={bracketPresentationRequest}
                      showViewportControls={false}
                    />
                  ) : bundle.standings.length > 0 ? (
                    <div className="standings-grid">
                      {bundle.standings.map((standing) => (
                        <div key={standing.racerId} className="standing-row">
                          <strong>#{standing.rank}</strong>
                          <span>{resolveRacerName(liveSnapshot, standing.racerId)}</span>
                          <span>
                            {standing.wins}-{standing.losses}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : bundle.bracketNodes.length > 0 ? (
                    <div className="bracket-summary">
                      <strong>Elimination bracket ready</strong>
                      <span>Expand this tournament card to view the live bracket.</span>
                    </div>
                  ) : (
                    <EmptyState
                      title="Tournament board will appear here"
                      body="Round robin and group-stage tournaments show live standings and match lists instead of an elimination bracket."
                    />
                  )}
                </m.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Panel>
    </m.div>
  );
}
