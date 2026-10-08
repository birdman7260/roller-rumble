import type { AppSnapshot, QueueEntry, TournamentQueueEntry } from "@roller-rumble/shared/types";
import { Button, EmptyState, Panel } from "@roller-rumble/shared-ui";
import { useState, type ReactNode } from "react";
import { formatRacerNames, isLeavableByRacer } from "../../lib/snapshot-display";
import { getQueuePositionLabel } from "./queue-position-label";

/** How many races a queue shows before the racer taps Show more. */
const QUEUE_PREVIEW_LIMIT = 6;

function QueueRowTitle({
  isMine,
  names,
  position
}: {
  isMine: boolean;
  names: string;
  position: number;
}) {
  return (
    <strong>
      {isMine ? <span className="visually-hidden">Your race</span> : null}#{position} {names}
    </strong>
  );
}

function QueueRow({
  entry,
  index,
  liveSnapshot,
  onRequestLeaveEntry,
  selectedRacerId
}: {
  entry: QueueEntry;
  index: number;
  liveSnapshot: AppSnapshot;
  onRequestLeaveEntry: (entry: QueueEntry) => void;
  selectedRacerId: string;
}) {
  const isMine = Boolean(selectedRacerId) && entry.racerIds.includes(selectedRacerId);
  return (
    <li className={`racer-queue-row${isMine ? " racer-queue-row--mine" : ""}`}>
      <div className="racer-queue-row__body">
        <QueueRowTitle
          isMine={isMine}
          names={formatRacerNames(liveSnapshot, entry.racerIds)}
          position={entry.position}
        />
        <span className="racer-queue-row__eta">
          {getQueuePositionLabel(index, liveSnapshot.settings.queueMinutesPerRace)}
        </span>
        {isLeavableByRacer(entry, selectedRacerId) ? (
          <Button
            variant="ghost"
            onClick={() => {
              onRequestLeaveEntry(entry);
            }}
          >
            Leave
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function TournamentQueueRow({
  entry,
  index,
  liveSnapshot,
  selectedRacerId
}: {
  entry: TournamentQueueEntry;
  index: number;
  liveSnapshot: AppSnapshot;
  selectedRacerId: string;
}) {
  const isMine = Boolean(selectedRacerId) && entry.racerIds.includes(selectedRacerId);
  return (
    <li className={`racer-queue-row${isMine ? " racer-queue-row--mine" : ""}`}>
      <div className="racer-queue-row__body">
        <div className="racer-queue-row__match">
          <QueueRowTitle
            isMine={isMine}
            names={formatRacerNames(liveSnapshot, entry.racerIds)}
            position={entry.position}
          />
          {entry.roundLabel ? (
            <span className="racer-queue-row__round">{entry.roundLabel}</span>
          ) : null}
        </div>
        <span className="racer-queue-row__eta">
          {getQueuePositionLabel(index, liveSnapshot.settings.queueMinutesPerRace)}
        </span>
      </div>
    </li>
  );
}

/** A queue's rows, cut to the first few with Show more to reveal the rest. */
function ExpandableQueueList({ label, rows }: { label: string; rows: ReactNode[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = rows.length > QUEUE_PREVIEW_LIMIT;

  return (
    <>
      <ol aria-label={label} className="racer-queue-list">
        {expanded ? rows : rows.slice(0, QUEUE_PREVIEW_LIMIT)}
      </ol>
      {hasMore ? (
        <button
          type="button"
          className="racer-inline-link"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </>
  );
}

/**
 * The open race queue on the Rumble tab: the first few races, with Show more to reveal the rest.
 * Races the signed-in racer is in are highlighted and carry a Leave button, which stays available
 * under a closed queue (issue #28).
 */
export function RumbleQueuePanel({
  liveSnapshot,
  onRequestLeaveEntry,
  selectedRacerId,
  upcoming
}: {
  liveSnapshot: AppSnapshot;
  onRequestLeaveEntry: (entry: QueueEntry) => void;
  /** Empty while no racer is signed in, so no row is highlighted or leavable. */
  selectedRacerId: string;
  upcoming: QueueEntry[];
}) {
  return (
    <Panel title="Race Queue">
      <div className="racer-race-preview stack-sm">
        {upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming races"
            body="The queue is open. Be the first racer to jump in."
          />
        ) : (
          <ExpandableQueueList
            label="Race queue"
            rows={upcoming.map((entry, index) => (
              <QueueRow
                key={entry.id}
                entry={entry}
                index={index}
                liveSnapshot={liveSnapshot}
                onRequestLeaveEntry={onRequestLeaveEntry}
                selectedRacerId={selectedRacerId}
              />
            ))}
          />
        )}
      </div>
    </Panel>
  );
}

/**
 * The `tournament queue` on the Rumble tab during a tourney: every race still to run, in the
 * bracket's order. Racers can't leave a tourney race from here; opting out is its own action.
 */
export function TournamentQueuePanel({
  footer,
  liveSnapshot,
  selectedRacerId,
  tournamentName,
  tournamentQueue
}: {
  /** Shown under the list, e.g. a link to the full bracket. */
  footer: ReactNode;
  liveSnapshot: AppSnapshot;
  /** Empty while no racer is signed in, so no row is highlighted. */
  selectedRacerId: string;
  tournamentName: string;
  tournamentQueue: TournamentQueueEntry[];
}) {
  return (
    <Panel title="Tourney Queue">
      <div className="racer-race-preview stack-sm">
        <div className="racer-section-heading">
          <strong>{tournamentName}</strong>
          <p>Races run in bracket order.</p>
        </div>
        {tournamentQueue.length === 0 ? (
          <EmptyState
            title="No tourney races left"
            body="The final results will show on the tourney tab."
          />
        ) : (
          <ExpandableQueueList
            label="Tourney queue"
            rows={tournamentQueue.map((entry, index) => (
              <TournamentQueueRow
                key={entry.matchId}
                entry={entry}
                index={index}
                liveSnapshot={liveSnapshot}
                selectedRacerId={selectedRacerId}
              />
            ))}
          />
        )}
        {footer}
      </div>
    </Panel>
  );
}
