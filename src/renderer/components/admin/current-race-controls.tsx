import type { AppSnapshot, RaceRecord } from "@shared/types";
import { formatRacerNames } from "../../lib/snapshot-display";

export function CurrentRaceActionRows({
  currentRace,
  showStageNextRaceButton,
  disableStageNextRaceButton,
  onStageNextRace,
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
  const showFinalizeAction = currentRace?.state === "active";

  if (raceIsInterrupted) {
    return (
      <div className="button-row">
        <button
          className="button"
          onClick={() => {
            onResumeInterrupted();
          }}
        >
          Resume Interrupted
        </button>
        <button
          className="button button--ghost"
          onClick={() => {
            onRestartInterrupted();
          }}
        >
          Restart Race
        </button>
        <button
          className="button button--ghost"
          onClick={() => {
            onFinalizeInterrupted();
          }}
        >
          Finalize As-Is
        </button>
      </div>
    );
  }

  if (!showStageAction && !showStartAction && !showFinalizeAction) {
    return null;
  }

  return (
    <>
      <div className="button-row">
        {showStageAction ? (
          <button
            className="button"
            disabled={disableStageNextRaceButton}
            onClick={() => {
              onStageNextRace?.();
            }}
          >
            Stage Next Race
          </button>
        ) : null}
        {showStartAction ? (
          <button
            className="button button--accent"
            onClick={() => {
              onStartCountdown();
            }}
          >
            Start Countdown
          </button>
        ) : null}
        {showFinalizeAction ? (
          <button
            className="button button--ghost"
            onClick={() => {
              onFinalizeCurrent();
            }}
          >
            Finalize Current
          </button>
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
