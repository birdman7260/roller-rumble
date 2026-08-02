import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { AppSnapshot, TournamentBundle } from "@roller-rumble/shared/types";
import {
  dismissRaceResultPresentation,
  finalizeCurrentRace,
  finalizeInterruptedRace,
  resetCurrentRaceToStaged,
  restartInterruptedRace,
  resumeInterruptedRace,
  stageNextRace,
  startCurrentRace,
  swapCurrentRaceLanes,
  unstageCurrentRace
} from "../../lib/api";
import { describeQueueEntry, resolveRacerName } from "../../lib/snapshot-display";
import { canSwapRaceLanes } from "@roller-rumble/shared/race-lanes";
import { LANE_SWAP_SHORTCUT_KEY } from "../../lib/lane-swap";
import { isShortcutKeystroke } from "../../lib/shortcuts";
import { fireAndForget } from "../../lib/ui-actions";
import { Button } from "@roller-rumble/shared-ui";
import { CurrentRaceActionRows, CurrentRaceSummary } from "./current-race-controls";
import type { AdminTabId } from "./types";

/** Module-scoped so the button and the keystroke fire exactly the same request. */
function requestLaneSwap(): void {
  fireAndForget(swapCurrentRaceLanes(), "swap race bikes");
}

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
  const resultPresentation = snapshot.raceProjection.resultPresentation;
  const nextQueueEntry = !activeTournament ? snapshot.raceProjection.nextQueueEntry : null;
  const currentTournamentRace =
    activeTournament && currentRace?.tournamentId === activeTournament.tournament.id
      ? currentRace
      : null;

  // A lane swap is the one race control with a keystroke: the riders are already on the bikes and
  // the host is looking at them, not at the laptop, so reaching for a button costs the moment.
  const swapShortcutEnabled = !resultPresentation && canSwapRaceLanes(currentRace);

  useEffect(() => {
    if (!swapShortcutEnabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (!isShortcutKeystroke(event, LANE_SWAP_SHORTCUT_KEY)) {
        return;
      }
      event.preventDefault();
      requestLaneSwap();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [swapShortcutEnabled]);

  // The tray only appears when there is an actual race workflow to act on from any tab.
  const showTray = Boolean(resultPresentation ?? currentRace ?? activeTournament ?? nextQueueEntry);
  if (!showTray) {
    return null;
  }

  const showOpenTimeTrialStageAction = Boolean(nextQueueEntry && !currentRace && !activeTournament);

  return (
    <aside className="admin-race-tray" aria-label="Race controls">
      <div className="admin-race-tray__meta">
        {resultPresentation ? (
          <>
            <p className="eyebrow">Race Results Showing</p>
            <div className="stack-sm">
              <strong>Winner modal is live on the projector</strong>
              <span className="admin-race-tray__detail">
                It will move on automatically after 15 seconds.
              </span>
            </div>
          </>
        ) : currentRace ? (
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
        {activeTournament && !resultPresentation && !currentRace && activeTab !== "tournaments" ? (
          <Button
            variant="ghost"
            onClick={() => {
              setActiveTab("tournaments");
            }}
          >
            Open Tournament Board
          </Button>
        ) : null}

        {resultPresentation ? (
          <Button
            variant="ghost"
            onClick={() => {
              fireAndForget(dismissRaceResultPresentation(), "dismiss race results");
            }}
          >
            Move On
          </Button>
        ) : null}

        {!resultPresentation ? (
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
              fireAndForget(
                unstageCurrentRace(),
                currentTournamentRace ? "unstage tournament race" : "unstage race"
              );
            }}
            onResetCurrent={() => {
              fireAndForget(
                resetCurrentRaceToStaged(),
                currentTournamentRace ? "reset tournament race" : "reset race"
              );
            }}
            onSwapLanes={() => {
              requestLaneSwap();
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
        ) : null}
      </div>
    </aside>
  );
}
