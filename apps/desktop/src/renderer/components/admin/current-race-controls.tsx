import type { AppSnapshot, RaceRecord } from "@goldsprints/shared/types";
import { formatRacerNames } from "../../lib/snapshot-display";
import { Button } from "@goldsprints/shared-ui";

export function CurrentRaceActionRows({
  currentRace,
  showStageNextRaceButton,
  disableStageNextRaceButton,
  onStageNextRace,
  onUnstageCurrent,
  onStartCountdown,
  onFinalizeCurrent,
  onResumeInterrupted,
  onRestartInterrupted,
  onFinalizeInterrupted
}: {
  currentRace: RaceRecord | null;
  showStageNextRaceButton?: boolean;
  disableStageNextRaceButton?: boolean;
  onStageNextRace?: () => void;
  onUnstageCurrent?: () => void;
  onStartCountdown: () => void;
  onFinalizeCurrent: () => void;
  onResumeInterrupted: () => void;
  onRestartInterrupted: () => void;
  onFinalizeInterrupted: () => void;
}) {
  const raceIsInterrupted = currentRace?.state === "interrupted";
  const showStageAction = showStageNextRaceButton && !currentRace;
  const showStartAction =
    currentRace != null && ["scheduled", "staging"].includes(currentRace.state);
  const showUnstageTournamentAction =
    currentRace?.tournamentId != null && ["scheduled", "staging"].includes(currentRace.state);
  const showFinalizeAction = currentRace?.state === "active";

  if (raceIsInterrupted) {
    return (
      <div className="button-row">
        <Button
          onClick={() => {
            onResumeInterrupted();
          }}
        >
          Resume Interrupted
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            onRestartInterrupted();
          }}
        >
          Restart Race
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            onFinalizeInterrupted();
          }}
        >
          Finalize As-Is
        </Button>
      </div>
    );
  }

  if (!showStageAction && !showStartAction && !showUnstageTournamentAction && !showFinalizeAction) {
    return null;
  }

  return (
    <>
      <div className="button-row">
        {showStageAction ? (
          <Button
            disabled={disableStageNextRaceButton}
            onClick={() => {
              onStageNextRace?.();
            }}
          >
            Stage Next Race
          </Button>
        ) : null}
        {showStartAction ? (
          <Button
            variant="accent"
            onClick={() => {
              onStartCountdown();
            }}
          >
            Start Countdown
          </Button>
        ) : null}
        {showUnstageTournamentAction ? (
          <Button
            variant="ghost"
            onClick={() => {
              onUnstageCurrent?.();
            }}
          >
            Unstage Match
          </Button>
        ) : null}
        {showFinalizeAction ? (
          <Button
            variant="ghost"
            onClick={() => {
              onFinalizeCurrent();
            }}
          >
            Finalize Current
          </Button>
        ) : null}
      </div>
    </>
  );
}

export function CurrentRaceSummary({
  snapshot,
  currentRace
}: {
  snapshot: AppSnapshot;
  currentRace: RaceRecord;
}) {
  return (
    <div className="stack-sm">
      <strong>
        {currentRace.state.toUpperCase()} •{" "}
        {currentRace.format === "solo" ? "Solo" : "Head-to-head"}
      </strong>
      <span>
        {formatRacerNames(
          snapshot,
          currentRace.participants.map((participant) => participant.racerId)
        )}
      </span>
    </div>
  );
}
