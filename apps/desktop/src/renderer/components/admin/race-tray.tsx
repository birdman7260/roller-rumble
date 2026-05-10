import type { Dispatch, SetStateAction } from "react";
import type { AppSnapshot, TournamentBundle } from "@goldsprints/shared/types";
import {
  finalizeCurrentRace,
  finalizeInterruptedRace,
  restartInterruptedRace,
  resumeInterruptedRace,
  stageNextRace,
  startCurrentRace,
  unstageCurrentTournamentRace
} from "../../lib/api";
import { describeQueueEntry, resolveRacerName } from "../../lib/snapshot-display";
import { fireAndForget } from "../../lib/ui-actions";
import { Button } from "@goldsprints/shared-ui";
import { CurrentRaceActionRows, CurrentRaceSummary } from "./current-race-controls";
import type { AdminTabId } from "./types";

export function AdminRaceTray({
  snapshot,
  activeTournament,
  activeTab,
  setActiveTab
}: {
  snapshot: AppSnapshot;
  activeTournament: TournamentBundle | null;
  activeTab: AdminTabId;
  setActiveTab: Dispatch<SetStateAction<AdminTabId>>;
}) {
  const currentRace = snapshot.raceProjection.race;
  const nextQueueEntry = !activeTournament ? (snapshot.queue[0] ?? null) : null;
  const currentTournamentRace =
    activeTournament && currentRace?.tournamentId === activeTournament.tournament.id
      ? currentRace
      : null;

  // The tray only appears when there is an actual race workflow to act on from any tab.
  const showTray = Boolean(currentRace ?? activeTournament ?? nextQueueEntry);
  if (!showTray) {
    return null;
  }

  const showOpenTimeTrialStageAction = Boolean(nextQueueEntry && !currentRace && !activeTournament);

  return (
    <aside className="admin-race-tray" aria-label="Race controls">
      <div className="admin-race-tray__meta">
        {currentRace ? (
          <>
            <p className="eyebrow">
              {currentTournamentRace ? "Tournament Race Ready" : "Race Controls Live"}
            </p>
            <CurrentRaceSummary snapshot={snapshot} currentRace={currentRace} />
          </>
        ) : activeTournament ? (
          <>
            <p className="eyebrow">Tournament In Progress</p>
            <div className="stack-sm">
              <strong>{activeTournament.tournament.name}</strong>
              <span className="admin-race-tray__detail">
                {activeTab === "tournaments"
                  ? "Stage the next matchup from the board above. Countdown controls will appear here as soon as a race is staged."
                  : "No matchup is staged yet. Open the tournament board to pick the next race."}
              </span>
            </div>
          </>
        ) : nextQueueEntry ? (
          <>
            <p className="eyebrow">Next Open Time Trial Race</p>
            <div className="stack-sm">
              <strong>
                #{nextQueueEntry.position}{" "}
                {nextQueueEntry.racerIds
                  .map((racerId) => resolveRacerName(snapshot, racerId))
                  .join(" vs ")}
              </strong>
              <span className="admin-race-tray__detail">{describeQueueEntry(nextQueueEntry)}</span>
            </div>
          </>
        ) : null}
      </div>

      <div className="admin-race-tray__actions">
        {activeTournament && !currentRace && activeTab !== "tournaments" ? (
          <Button
            variant="ghost"
            onClick={() => {
              setActiveTab("tournaments");
            }}
          >
            Open Tournament Board
          </Button>
        ) : null}

        <CurrentRaceActionRows
          currentRace={currentRace}
          showStageNextRaceButton={showOpenTimeTrialStageAction}
          onStageNextRace={() => {
            fireAndForget(stageNextRace(), "stage next race");
          }}
          onStartCountdown={() => {
            fireAndForget(
              startCurrentRace(),
              currentTournamentRace ? "start tournament race" : "start race"
            );
          }}
          onUnstageCurrent={() => {
            fireAndForget(unstageCurrentTournamentRace(), "unstage tournament race");
          }}
          onFinalizeCurrent={() => {
            fireAndForget(
              finalizeCurrentRace(),
              currentTournamentRace ? "finalize tournament race" : "finalize race"
            );
          }}
          onResumeInterrupted={() => {
            fireAndForget(
              resumeInterruptedRace(),
              currentTournamentRace
                ? "resume interrupted tournament race"
                : "resume interrupted race"
            );
          }}
          onRestartInterrupted={() => {
            fireAndForget(
              restartInterruptedRace(),
              currentTournamentRace
                ? "restart interrupted tournament race"
                : "restart interrupted race"
            );
          }}
          onFinalizeInterrupted={() => {
            fireAndForget(
              finalizeInterruptedRace(),
              currentTournamentRace
                ? "finalize interrupted tournament race"
                : "finalize interrupted race"
            );
          }}
        />
      </div>
    </aside>
  );
}
