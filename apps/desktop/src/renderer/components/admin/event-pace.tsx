import { useState } from "react";
import type { AppSnapshot, RacePace } from "@roller-rumble/shared/types";
import { Button, Modal, StatPill } from "@roller-rumble/shared-ui";
import { dismissTournamentStartCheck, updateSettings } from "../../lib/api";
import {
  countRacesToRun,
  forecastTournamentStart,
  isTournamentStartCheckDue,
  type TournamentStartForecast
} from "../../lib/tournament-start-forecast";
import { fireAndForget } from "../../lib/ui-actions";

/** "2:10" — minutes and seconds per race. */
function formatPace(secondsPerRace: number): string {
  const minutes = Math.floor(secondsPerRace / 60);
  const seconds = String(secondsPerRace % 60).padStart(2, "0");
  return `${String(minutes)}:${seconds}`;
}

/** "34 min", or "1 h 05 min" past an hour. */
function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0
    ? `${String(hours)} h ${String(minutes).padStart(2, "0")} min`
    : `${String(minutes)} min`;
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function pluralRaces(count: number): string {
  return `${String(count)} ${count === 1 ? "race" : "races"}`;
}

function describePaceSource(pace: RacePace): string {
  return pace.source === "measured"
    ? `Measured over the last ${pluralRaces(pace.sampleCount)}`
    : "Your minutes-per-race setting, until two races finish";
}

function describeForecast(forecast: TournamentStartForecast): string {
  if (!forecast.onTrack) {
    return `Over by ${pluralRaces(-forecast.spareRaces)}`;
  }
  return forecast.spareRaces > 0
    ? `On track · room for ${pluralRaces(forecast.spareRaces)} more`
    : "On track · no room for more";
}

function describeTimeUntilStart(forecast: TournamentStartForecast): string {
  return forecast.msUntilStart > 0
    ? `in ${formatDuration(forecast.msUntilStart)}`
    : "start time passed";
}

interface PlannedStartOutlook {
  startsAt: string;
  racesToRun: number;
  forecast: TournamentStartForecast;
}

/** The active event's planned tournament start and its forecast, or null when none is planned. */
function getPlannedStartOutlook(snapshot: AppSnapshot, nowMs: number): PlannedStartOutlook | null {
  const startsAt = snapshot.activeEvent.tournamentStartsAt;
  if (!startsAt) {
    return null;
  }
  const racesToRun = countRacesToRun(snapshot);
  return {
    startsAt,
    racesToRun,
    forecast: forecastTournamentStart({
      startsAt,
      nowMs,
      racesRemaining: racesToRun,
      secondsPerRace: snapshot.racePace.secondsPerRace
    })
  };
}

/**
 * The admin header's always-on readout of the `race pace`, and — once a tournament start is
 * planned and no tournament is running yet — whether the queue clears in time.
 */
export function EventPaceReadout({
  snapshot,
  tournamentActive,
  nowMs
}: {
  snapshot: AppSnapshot;
  tournamentActive: boolean;
  nowMs: number;
}) {
  const outlook = tournamentActive ? null : getPlannedStartOutlook(snapshot, nowMs);

  return (
    <div className="admin-event-pace">
      <StatPill
        label="Race pace"
        value={
          <span title={describePaceSource(snapshot.racePace)}>
            {formatPace(snapshot.racePace.secondsPerRace)} / race
            {snapshot.racePace.source === "default" ? " (est.)" : ""}
          </span>
        }
      />
      {outlook ? (
        <>
          <StatPill
            label="Tournament"
            value={`${formatClockTime(outlook.startsAt)} · ${describeTimeUntilStart(outlook.forecast)}`}
          />
          <StatPill
            label="Queue"
            value={`${pluralRaces(outlook.racesToRun)} ≈ ${formatDuration(outlook.forecast.msToClearQueue)}`}
          />
          <StatPill
            label="Forecast"
            tone={outlook.forecast.onTrack ? "positive" : "negative"}
            value={describeForecast(outlook.forecast)}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * The `tournament start check`: twenty minutes before the planned tournament start, lays out
 * whether the queue will clear in time and offers to close it so it stops growing. Answering it
 * either way keeps it closed for this planned start.
 */
export function TournamentStartCheckModal({
  snapshot,
  tournamentActive,
  nowMs
}: {
  snapshot: AppSnapshot;
  tournamentActive: boolean;
  nowMs: number;
}) {
  const [busy, setBusy] = useState(false);
  const outlook = getPlannedStartOutlook(snapshot, nowMs);
  const due = isTournamentStartCheckDue({
    startsAt: snapshot.activeEvent.tournamentStartsAt,
    dismissedAt: snapshot.activeEvent.tournamentStartCheckDismissedAt,
    queueOpen: snapshot.settings.queueOpen,
    tournamentActive,
    nowMs
  });

  async function answer(closeQueue: boolean): Promise<void> {
    setBusy(true);
    try {
      if (closeQueue) {
        await updateSettings({ queueOpen: false });
      }
      await dismissTournamentStartCheck();
    } finally {
      setBusy(false);
    }
  }

  if (!due || !outlook) {
    return null;
  }

  const { startsAt, racesToRun, forecast } = outlook;

  return (
    <Modal
      open
      eyebrow="Tournament start check"
      title={forecast.onTrack ? "The queue clears in time" : "The queue runs past the start"}
      dismissDisabled={busy}
      onDismiss={() => {
        fireAndForget(answer(false), "keep queue open");
      }}
      actions={
        <>
          <Button
            autoFocus
            variant="ghost"
            disabled={busy}
            onClick={() => {
              fireAndForget(answer(false), "keep queue open");
            }}
          >
            Keep Queue Open
          </Button>
          <Button
            variant="accent"
            disabled={busy}
            onClick={() => {
              fireAndForget(answer(true), "close queue for tournament");
            }}
          >
            Close the Queue
          </Button>
        </>
      }
    >
      <div className="stack-sm">
        <p>
          The tournament is planned for {formatClockTime(startsAt)} (
          {describeTimeUntilStart(forecast)}).
        </p>
        <div className="stat-grid">
          <StatPill label="Races to run" value={racesToRun} />
          <StatPill
            label="Race pace"
            value={`${formatPace(snapshot.racePace.secondsPerRace)} / race`}
          />
          <StatPill label="Time to clear" value={formatDuration(forecast.msToClearQueue)} />
          <StatPill
            label="Forecast"
            tone={forecast.onTrack ? "positive" : "negative"}
            value={describeForecast(forecast)}
          />
        </div>
        <p className="admin-event-pace__note">{describePaceSource(snapshot.racePace)}.</p>
        <p>
          Close the queue so it stops growing? Racers already queued keep their spots, and you can
          still add racers yourself.
        </p>
      </div>
    </Modal>
  );
}
