import { Fragment } from "react";
import type { AppSnapshot, RaceRecord } from "@roller-rumble/shared/types";
import { bikeColorForLane, racerBikeColors } from "../../lib/bike-colors";
import { resolveRacerName } from "../../lib/snapshot-display";
import { RacerNamesByBike, BikeName } from "../racer-names-by-bike";
import { canSwapRaceLanes } from "@roller-rumble/shared/race-lanes";
import { describeBike, describeLaneSwap, LANE_SWAP_SHORTCUT_KEY } from "../../lib/lane-swap";
import { Button } from "@roller-rumble/shared-ui";

export function CurrentRaceActionRows({
  currentRace,
  showStageNextRaceButton,
  disableStageNextRaceButton,
  onStageNextRace,
  onUnstageCurrent,
  onResetCurrent,
  onSwapLanes,
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
  onResetCurrent?: () => void;
  onSwapLanes?: () => void;
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
  const showUnstageAction =
    currentRace != null && ["scheduled", "staging"].includes(currentRace.state);
  const showSwapAction = canSwapRaceLanes(currentRace);
  const showResetAction =
    currentRace != null && ["countdown", "active"].includes(currentRace.state);
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

  if (
    !showStageAction &&
    !showStartAction &&
    !showUnstageAction &&
    !showSwapAction &&
    !showResetAction &&
    !showFinalizeAction
  ) {
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
        {showUnstageAction ? (
          <Button
            variant="ghost"
            onClick={() => {
              onUnstageCurrent?.();
            }}
          >
            Unstage Race
          </Button>
        ) : null}
        {showSwapAction ? (
          <Button
            variant="ghost"
            onClick={() => {
              onSwapLanes?.();
            }}
          >
            {describeLaneSwap(currentRace?.participants ?? [])} (
            {LANE_SWAP_SHORTCUT_KEY.toUpperCase()})
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
        {showResetAction ? (
          <Button
            variant="ghost"
            onClick={() => {
              onResetCurrent?.();
            }}
          >
            Reset To Staged
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
  const laneColorsFlipped = snapshot.settings.raceDisplayLaneColorsFlipped;
  const racerIds = currentRace.participants.map((participant) => participant.racerId);

  return (
    <div className="stack-sm">
      <strong>
        {currentRace.state.toUpperCase()} •{" "}
        {currentRace.format === "solo" ? "Solo" : "Head-to-head"}
      </strong>
      {/* Each name in its bike's colour, read off the race's lanes so a lane swap recolours it. */}
      <span>
        <RacerNamesByBike
          colors={racerBikeColors(racerIds, currentRace, laneColorsFlipped)}
          racerIds={racerIds}
          snapshot={snapshot}
        />
      </span>
      {/* The lineup the app believes, spelled out per bike: a lane swap is only checkable if the
          operator can compare it against the riders actually sitting in front of them. */}
      <span className="admin-race-tray__detail">
        {currentRace.participants.map((participant, index) => (
          <Fragment key={participant.racerId}>
            {index > 0 ? " • " : null}
            {describeBike(participant.lane)}:{" "}
            <BikeName color={bikeColorForLane(participant.lane, laneColorsFlipped)}>
              {resolveRacerName(snapshot, participant.racerId)}
            </BikeName>
          </Fragment>
        ))}
      </span>
    </div>
  );
}
