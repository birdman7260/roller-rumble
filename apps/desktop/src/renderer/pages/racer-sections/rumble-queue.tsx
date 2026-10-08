import type { AppSnapshot, QueueEntry } from "@roller-rumble/shared/types";
import { Button, EmptyState, Panel } from "@roller-rumble/shared-ui";
import { useState } from "react";
import { formatRacerNames, isLeavableByRacer } from "../../lib/snapshot-display";
import { getQueuePositionLabel } from "./queue-position-label";

/** How many races the queue shows before the racer taps Show more. */
const QUEUE_PREVIEW_LIMIT = 6;

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
        <strong>
          {isMine ? <span className="visually-hidden">Your race</span> : null}#{entry.position}{" "}
          {formatRacerNames(liveSnapshot, entry.racerIds)}
        </strong>
        <span className="racer-queue-row__eta">{getQueuePositionLabel(index)}</span>
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
  const [expanded, setExpanded] = useState(false);
  const hasMore = upcoming.length > QUEUE_PREVIEW_LIMIT;
  const visibleEntries = expanded ? upcoming : upcoming.slice(0, QUEUE_PREVIEW_LIMIT);

  return (
    <Panel title="Race Queue">
      <div className="racer-race-preview stack-sm">
        {upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming races"
            body="The queue is open. Be the first racer to jump in."
          />
        ) : (
          <ol aria-label="Race queue" className="racer-queue-list">
            {visibleEntries.map((entry, index) => (
              <QueueRow
                key={entry.id}
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
