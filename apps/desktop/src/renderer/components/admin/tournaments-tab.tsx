import { AnimatePresence, LayoutGroup, m, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { competitionPresets } from "@roller-rumble/shared/presets";
import type {
  AppSnapshot,
  TournamentBracketSize,
  TournamentBundle,
  TournamentBracketLayoutMode,
  TournamentPreset
} from "@roller-rumble/shared/types";
import { Button, EmptyState, Panel, StatPill, TextInput } from "@roller-rumble/shared-ui";
import {
  createTournament,
  endTournamentEarly,
  stageTournamentBracketMatch,
  stageTournamentGroupMatch,
  undoTournamentBracketMatch,
  undoTournamentGroupMatch
} from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";
import { getBracketLayoutLabel, getPresetLabel } from "../../lib/admin-competition";
import { TournamentBracketBoard, TournamentGroupMatchBoard } from "./tournament-board";

function TournamentSummaryPanel({
  activeTournament,
  activeTournamentBracketLayout,
  activeTournamentBracketSize,
  selectedBracketSize,
  setTournamentBracketLayout,
  setTournamentBracketSize,
  setTournamentBracketSizeTouched,
  setTournamentName,
  setTournamentPreset,
  snapshot,
  tournamentBracketLayout,
  tournamentBracketLayoutOptions,
  tournamentBracketSizeOptions,
  tournamentName,
  tournamentPreset,
  tournamentPresetOptions,
  tournamentPresetSupportsBracketSizing,
  tournamentPresetSupportsCenterConverging
}: {
  activeTournament: TournamentBundle | null;
  activeTournamentBracketLayout: TournamentBracketLayoutMode;
  activeTournamentBracketSize: number | null;
  selectedBracketSize: TournamentBracketSize | undefined;
  setTournamentBracketLayout: Dispatch<SetStateAction<TournamentBracketLayoutMode>>;
  setTournamentBracketSize: Dispatch<SetStateAction<TournamentBracketSize>>;
  setTournamentBracketSizeTouched: Dispatch<SetStateAction<boolean>>;
  setTournamentName: Dispatch<SetStateAction<string>>;
  setTournamentPreset: Dispatch<SetStateAction<TournamentPreset>>;
  snapshot: AppSnapshot;
  tournamentBracketLayout: TournamentBracketLayoutMode;
  tournamentBracketLayoutOptions: {
    id: TournamentBracketLayoutMode;
    label: string;
    description: string;
  }[];
  tournamentBracketSizeOptions: TournamentBracketSize[];
  tournamentName: string;
  tournamentPreset: TournamentPreset;
  tournamentPresetOptions: { id: TournamentPreset; label: string; description: string }[];
  tournamentPresetSupportsBracketSizing: boolean;
  tournamentPresetSupportsCenterConverging: boolean;
}) {
  const selectedPreset = competitionPresets.find((preset) => preset.id === tournamentPreset);
  const selectedLayoutDescription =
    tournamentBracketLayoutOptions.find((layout) => layout.id === tournamentBracketLayout)
      ?.description ?? "Choose how the bracket should be drawn.";

  return (
    <Panel
      title={activeTournament ? "Active Tournament" : "Start Tournament"}
      actions={
        activeTournament ? (
          <Button
            variant="ghost"
            onClick={() => {
              fireAndForget(
                endTournamentEarly(activeTournament.tournament.id),
                "end tournament early"
              );
            }}
          >
            End Tournament Early
          </Button>
        ) : undefined
      }
    >
      {activeTournament ? (
        <div className="stack-md">
          <div className="stat-grid">
            <StatPill label="Name" value={activeTournament.tournament.name} />
            <StatPill label="Format" value={getPresetLabel(activeTournament.tournament.preset)} />
            {activeTournamentBracketSize ? (
              <StatPill label="Bracket" value={`${activeTournamentBracketSize} slots`} />
            ) : null}
            <StatPill label="Layout" value={getBracketLayoutLabel(activeTournamentBracketLayout)} />
            <StatPill label="Status" value={activeTournament.tournament.status} />
            <StatPill label="Seeds" value={activeTournament.seeds.length} />
          </div>
          <p>
            Open time trial is paused while this tournament is active. Stage the next matchup from
            the tournament board below, or end the tournament early to return to the regular queue
            flow.
          </p>
        </div>
      ) : (
        <div className="form-grid">
          <label htmlFor="tournament-name">
            Tournament name
            <TextInput
              id="tournament-name"
              value={tournamentName}
              onChange={(event) => {
                setTournamentName(event.target.value);
              }}
              placeholder="Bracket Night"
            />
          </label>
          <label>
            Format
            <select
              value={tournamentPreset}
              onChange={(event) => {
                setTournamentPreset(event.target.value as TournamentPreset);
                setTournamentBracketSizeTouched(false);
                setTournamentBracketLayout("auto");
              }}
            >
              {tournamentPresetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          {tournamentPresetSupportsBracketSizing ? (
            <label>
              Bracket size
              <select
                value={selectedBracketSize ?? tournamentBracketSizeOptions[0]}
                onChange={(event) => {
                  setTournamentBracketSizeTouched(true);
                  setTournamentBracketSize(Number(event.target.value) as TournamentBracketSize);
                }}
              >
                {tournamentBracketSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size} slots
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selectedPreset?.createsBracket ? (
            <label>
              Bracket layout
              <select
                value={tournamentBracketLayout}
                onChange={(event) => {
                  setTournamentBracketLayout(event.target.value as TournamentBracketLayoutMode);
                }}
              >
                {tournamentBracketLayoutOptions.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="stack-sm">
            <strong>{getPresetLabel(tournamentPreset)}</strong>
            <span>
              {selectedPreset?.description ?? "Choose a tournament format to seed from event results."}
            </span>
            {selectedBracketSize ? (
              <span>
                {selectedBracketSize < snapshot.racers.length
                  ? `Seed the top ${selectedBracketSize} racers from the ${snapshot.racers.length} registered for this event.`
                  : `${selectedBracketSize}-slot bracket with ${snapshot.racers.length} registered racers. Empty slots become byes.`}
              </span>
            ) : null}
            {selectedPreset?.createsBracket ? <span>{selectedLayoutDescription}</span> : null}
            {!tournamentPresetSupportsCenterConverging &&
            tournamentPreset === "double-elimination" ? (
              <span>Double elimination stays on a standard board layout for now.</span>
            ) : null}
          </div>
          <Button
            onClick={() => {
              fireAndForget(
                createTournament({
                  name: tournamentName,
                  preset: tournamentPreset,
                  bracketSize: selectedBracketSize,
                  bracketLayout: tournamentBracketLayout
                }),
                "start tournament"
              );
            }}
          >
            Start Tournament
          </Button>
        </div>
      )}
    </Panel>
  );
}

export function TournamentsTab({
  snapshot,
  activeTournament,
  activeTournamentBracketSize,
  activeTournamentBracketLayout,
  completedTournaments,
  tournamentPresetOptions,
  tournamentPresetSupportsBracketSizing,
  tournamentPresetSupportsCenterConverging,
  tournamentBracketSizeOptions,
  tournamentBracketLayoutOptions,
  tournamentName,
  setTournamentName,
  tournamentPreset,
  setTournamentPreset,
  setTournamentBracketSizeTouched,
  selectedBracketSize,
  setTournamentBracketSize,
  tournamentBracketLayout,
  setTournamentBracketLayout,
  tournamentRaceLocked
}: {
  snapshot: AppSnapshot;
  activeTournament: TournamentBundle | null;
  activeTournamentBracketSize: number | null;
  activeTournamentBracketLayout: TournamentBracketLayoutMode;
  completedTournaments: TournamentBundle[];
  tournamentPresetOptions: { id: TournamentPreset; label: string; description: string }[];
  tournamentPresetSupportsBracketSizing: boolean;
  tournamentPresetSupportsCenterConverging: boolean;
  tournamentBracketSizeOptions: TournamentBracketSize[];
  tournamentBracketLayoutOptions: {
    id: TournamentBracketLayoutMode;
    label: string;
    description: string;
  }[];
  tournamentName: string;
  setTournamentName: Dispatch<SetStateAction<string>>;
  tournamentPreset: TournamentPreset;
  setTournamentPreset: Dispatch<SetStateAction<TournamentPreset>>;
  setTournamentBracketSizeTouched: Dispatch<SetStateAction<boolean>>;
  selectedBracketSize: TournamentBracketSize | undefined;
  setTournamentBracketSize: Dispatch<SetStateAction<TournamentBracketSize>>;
  tournamentBracketLayout: TournamentBracketLayoutMode;
  setTournamentBracketLayout: Dispatch<SetStateAction<TournamentBracketLayoutMode>>;
  tournamentRaceLocked: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [expandedBracketTournamentId, setExpandedBracketTournamentId] = useState<string | null>(
    null
  );
  const bracketExpanded = Boolean(
    activeTournament?.bracketNodes.length &&
    expandedBracketTournamentId === activeTournament.tournament.id
  );
  const showSupportingCards = !bracketExpanded;
  const showTournamentHistory = showSupportingCards && !activeTournament;
  const showTournamentMatches =
    showSupportingCards && Boolean(activeTournament?.groupMatches.length);
  // The idle setup state has no bracket yet, so the start controls and history can share a row.
  const useSetupLayout = showSupportingCards && !activeTournament;
  const supportingCardMotion = reduceMotion
    ? {
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        initial: { opacity: 0 }
      }
    : {
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: {
          opacity: 0,
          scale: 0.985,
          y: 18,
          transition: { duration: 0.16, ease: "easeOut" as const }
        },
        initial: { opacity: 0, scale: 0.99, y: 14 }
      };
  const layoutTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 230, damping: 28, mass: 0.92 };

  return (
    <LayoutGroup id="tournament-workspace">
      <div
        className={`page-grid tournaments-tab${
          bracketExpanded ? " tournaments-tab--bracket-expanded" : ""
        }${useSetupLayout ? " tournaments-tab--setup" : ""}`}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {showSupportingCards ? (
            <m.div
              key="tournament-summary"
              layout="position"
              transition={{ layout: layoutTransition }}
              {...supportingCardMotion}
              className="tournaments-tab__card tournaments-tab__card--supporting"
            >
              <TournamentSummaryPanel
                activeTournament={activeTournament}
                activeTournamentBracketLayout={activeTournamentBracketLayout}
                activeTournamentBracketSize={activeTournamentBracketSize}
                selectedBracketSize={selectedBracketSize}
                setTournamentBracketLayout={setTournamentBracketLayout}
                setTournamentBracketSize={setTournamentBracketSize}
                setTournamentBracketSizeTouched={setTournamentBracketSizeTouched}
                setTournamentName={setTournamentName}
                setTournamentPreset={setTournamentPreset}
                snapshot={snapshot}
                tournamentBracketLayout={tournamentBracketLayout}
                tournamentBracketLayoutOptions={tournamentBracketLayoutOptions}
                tournamentBracketSizeOptions={tournamentBracketSizeOptions}
                tournamentName={tournamentName}
                tournamentPreset={tournamentPreset}
                tournamentPresetOptions={tournamentPresetOptions}
                tournamentPresetSupportsBracketSizing={tournamentPresetSupportsBracketSizing}
                tournamentPresetSupportsCenterConverging={
                  tournamentPresetSupportsCenterConverging
                }
              />
            </m.div>
          ) : null}
        </AnimatePresence>

        {activeTournament?.bracketNodes.length ? (
          <m.div
            layout
            transition={{ layout: layoutTransition }}
            className={`tournaments-tab__card tournaments-tab__card--bracket${
              bracketExpanded ? " tournaments-tab__card--bracket-expanded" : ""
            }`}
          >
            <Panel
              title="Bracket Board"
              className={`tournaments-tab__panel${
                bracketExpanded ? " tournaments-tab__panel--bracket-expanded" : ""
              }`}
            >
              <TournamentBracketBoard
                key={activeTournament.tournament.id}
                snapshot={snapshot}
                bundle={activeTournament}
                canStageMatches={!tournamentRaceLocked}
                expanded={bracketExpanded}
                onExpandedChange={(expanded) => {
                  setExpandedBracketTournamentId(expanded ? activeTournament.tournament.id : null);
                }}
                onStageMatch={(nodeId) => {
                  fireAndForget(
                    stageTournamentBracketMatch(activeTournament.tournament.id, nodeId),
                    "stage tournament bracket match"
                  );
                }}
                onUndoMatch={(nodeId) => {
                  fireAndForget(
                    undoTournamentBracketMatch(activeTournament.tournament.id, nodeId),
                    "undo tournament bracket match"
                  );
                }}
              />
            </Panel>
          </m.div>
        ) : null}

        <AnimatePresence initial={false} mode="popLayout">
          {showTournamentMatches && activeTournament ? (
            <m.div
              key="tournament-matches"
              layout="position"
              transition={{ layout: layoutTransition }}
              {...supportingCardMotion}
              className="tournaments-tab__card tournaments-tab__card--supporting"
            >
              <Panel title="Tournament Matches">
                <TournamentGroupMatchBoard
                  snapshot={snapshot}
                  bundle={activeTournament}
                  canStageMatches={!tournamentRaceLocked}
                  onStageMatch={(matchId) => {
                    fireAndForget(
                      stageTournamentGroupMatch(activeTournament.tournament.id, matchId),
                      "stage tournament group match"
                    );
                  }}
                  onUndoMatch={(matchId) => {
                    fireAndForget(
                      undoTournamentGroupMatch(activeTournament.tournament.id, matchId),
                      "undo tournament group match"
                    );
                  }}
                />
              </Panel>
            </m.div>
          ) : null}

          {showTournamentHistory ? (
            <m.div
              key="tournament-history"
              layout="position"
              transition={{ layout: layoutTransition }}
              {...supportingCardMotion}
              className="tournaments-tab__card tournaments-tab__card--supporting"
            >
              <Panel title="Tournament History">
                {completedTournaments.length === 0 ? (
                  <EmptyState
                    title="No completed tournaments yet"
                    body="Start a tournament here when you are ready to seed the field."
                  />
                ) : (
                  <div className="list">
                    {completedTournaments.map((bundle) => (
                      <div key={bundle.tournament.id} className="list-row">
                        <div>
                          <strong>{bundle.tournament.name}</strong>
                          <p>{getPresetLabel(bundle.tournament.preset)}</p>
                        </div>
                        <div className="stack-sm align-end">
                          <strong>{bundle.tournament.status}</strong>
                          <span>{bundle.seeds.length} seeded racers</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
