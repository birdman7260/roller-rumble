import type { AppSnapshot, QueueEntry } from "@roller-rumble/shared/types";
import { Button, EmptyState, Panel } from "@roller-rumble/shared-ui";
import { useState } from "react";
import { formatRacerNames, isLeavableByRacer } from "../../lib/snapshot-display";
import { getQueuePositionLabel } from "./queue-position-label";

/** How many races the queue shows before the racer taps Show more. */
const QUEUE_PREVIEW_LIMIT = 6;

function QueueRow({
  canLeave,
  entry,
  index,
  liveSnapshot,
  onRequestLeaveEntry,
  selectedRacerId
}: {
  canLeave: boolean;
  entry: QueueEntry;
  index: number;
  liveSnapshot: AppSnapshot;
  onRequestLeaveEntry: (entry: QueueEntry) => void;
  selectedRacerId: string;
}) {
  const isMine = Boolean(selectedRacerId) && entry.racerIds.includes(selectedRacerId);
  return (
    <li className={`list-row racer-queue-row${isMine ? " racer-queue-row--mine" : ""}`}>
      <strong>
        {isMine ? <span className="visually-hidden">Your race</span> : null}#{entry.position}{" "}
        {formatRacerNames(liveSnapshot, entry.racerIds)}
      </strong>
      <span>{getQueuePositionLabel(index)}</span>
      {canLeave && isLeavableByRacer(entry, selectedRacerId) ? (
        <Button
          variant="ghost"
          onClick={() => {
            onRequestLeaveEntry(entry);
          }}
        >
          Leave
        </Button>
      ) : null}
    </li>
  );
}

/**
 * The open race queue on the Rumble tab: the first few races, with Show more to reveal the rest.
 * Races the signed-in racer is in are highlighted and carry a Leave button.
 */
export function RumbleQueuePanel({
  canLeave,
  liveSnapshot,
  onRequestLeaveEntry,
  selectedRacerId,
  tournamentMode,
  upcoming
}: {
  /** Leaving is frozen during a tournament but stays available under a closed queue (issue #28). */
  canLeave: boolean;
  liveSnapshot: AppSnapshot;
  onRequestLeaveEntry: (entry: QueueEntry) => void;
  selectedRacerId: string;
  tournamentMode: boolean;
  upcoming: QueueEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = upcoming.length > QUEUE_PREVIEW_LIMIT;
  const visibleEntries = expanded ? upcoming : upcoming.slice(0, QUEUE_PREVIEW_LIMIT);

  return (
    <Panel title="Race Queue">
      <div className="racer-race-preview stack-sm">
        {tournamentMode ? (
          <EmptyState title="Open queue paused" body="Tourney in progress" />
        ) : null}
        {upcoming.length === 0 ? (
          tournamentMode ? null : (
            <EmptyState
              title="No upcoming races"
              body="The queue is open. Be the first racer to jump in."
            />
          )
        ) : (
          <ol
            aria-label="Race queue"
            className={`list racer-queue-list${tournamentMode ? " racer-queue-list--paused" : ""}`}
          >
            {visibleEntries.map((entry, index) => (
              <QueueRow
                key={entry.id}
                canLeave={canLeave}
                entry={entry}
                index={index}
                liveSnapshot={liveSnapshot}
                onRequestLeaveEntry={onRequestLeaveEntry}
                selectedRacerId={selectedRacerId}
              />
            ))}
          </ol>
        )}
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
      </div>
    </Panel>
  );
}
