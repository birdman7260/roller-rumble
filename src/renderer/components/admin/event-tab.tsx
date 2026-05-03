import type { Dispatch, SetStateAction } from "react";
import type { AppSnapshot, RaceRecord, TournamentBundle } from "@shared/types";
import { EmptyState, Panel, StatPill } from "../ui";
import { createEvent } from "../../lib/api";
import { formatRacerNames } from "../../lib/snapshot-display";
import { fireAndForget } from "../../lib/ui-actions";

export function EventTab({
  snapshot,
  settingsThemeLabel,
  activeTournament,
  currentRace,
  competitionLabel,
  newEventName,
  resolvedEventName,
  setNewEventName
}: {
  snapshot: AppSnapshot;
  settingsThemeLabel: string;
  activeTournament: TournamentBundle | null;
  currentRace: RaceRecord | null;
  competitionLabel: string;
  newEventName: string;
  resolvedEventName: string;
  setNewEventName: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="page-grid">
      <Panel
        title="Event Control"
        actions={
          <button
            className="button button--ghost"
            onClick={() => {
              fireAndForget(createEvent(resolvedEventName));
            }}
          >
            Start New Event
          </button>
        }
      >
        <div className="form-row">
          <input
            value={newEventName}
            onChange={(event) => {
              setNewEventName(event.target.value);
            }}
            placeholder="Friday Finals"
          />
          <button
            className="button"
            onClick={() => {
              fireAndForget(createEvent(resolvedEventName));
            }}
          >
            Create Event
          </button>
        </div>
        <div className="stat-grid">
          <StatPill label="Active Event" value={snapshot.activeEvent.name} />
          <StatPill label="Racers" value={snapshot.racers.length} />
          <StatPill label="Upcoming" value={snapshot.queue.length} />
        </div>
      </Panel>

      <Panel title="Session Snapshot">
        <div className="stat-grid">
          <StatPill label="Competition" value={competitionLabel} />
          <StatPill label="Theme" value={settingsThemeLabel} />
          <StatPill
            label="Tournaments"
            value={
              activeTournament
                ? `${snapshot.tournaments.length} total · active`
                : snapshot.tournaments.length
            }
          />
          <StatPill label="Tunnel" value={snapshot.tunnel.status} />
        </div>
        <div className="stack-sm">
          {currentRace ? (
            <span>
              {`${currentRace.state.toUpperCase()} · ${formatRacerNames(
                snapshot,
                currentRace.participants.map((participant) => participant.racerId)
              )}`}
            </span>
          ) : (
            <EmptyState
              title="No race is currently staged"
              body="Queue or stage a race from the Race Desk when you are ready to run the next heat."
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
