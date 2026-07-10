import type { AppSnapshot, QueueEntry } from "@roller-rumble/shared/types";
import { Panel } from "@roller-rumble/shared-ui";
import { resolveRacerName } from "../../lib/snapshot-display";
import type { RacerTabId } from "../racer-page";
import { InlineTabLink } from "./inline-tab-link";

function getQueuePositionLabel(index: number): string {
  switch (index) {
    case 0:
      return "NOW!";
    case 1:
      return "In 2 minutes";
    case 2:
      return "In 4 minutes";
    case 3:
      return "Get the mind right";
    case 4:
      return "Start stretching";
    default:
      return "";
  }
}

export function QueuePreviewPanel({
  entries,
  liveSnapshot,
  onTabChange,
  showFullQueueLink
}: {
  entries: QueueEntry[];
  liveSnapshot: AppSnapshot;
  onTabChange: (tabId: RacerTabId) => void;
  showFullQueueLink: boolean;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <Panel title="Next 3 Races!">
      <div className="racer-race-preview stack-sm">
        <div className="racer-section-heading">
          <strong>Next up</strong>
          <p>The next few queue matches.</p>
        </div>
        <div className="list">
          {entries.map((entry, index) => (
            <div key={entry.id} className="list-row">
              <strong>
                #{entry.position}{" "}
                {entry.racerIds
                  .map((racerId) => resolveRacerName(liveSnapshot, racerId))
                  .join(" vs ")}
              </strong>
              <span>{getQueuePositionLabel(index)}</span>
            </div>
          ))}
        </div>
        {showFullQueueLink ? (
          <InlineTabLink tabId="queue" label="View full queue" onTabChange={onTabChange} />
        ) : null}
      </div>
    </Panel>
  );
}
