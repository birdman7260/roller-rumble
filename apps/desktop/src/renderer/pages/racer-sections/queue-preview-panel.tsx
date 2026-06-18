import type { AppSnapshot, QueueEntry } from "@roller-rumble/shared/types";
import { Panel } from "@roller-rumble/shared-ui";
import { describeQueueEntry, resolveRacerName } from "../../lib/snapshot-display";
import type { RacerTabId } from "../racer-page";
import { InlineTabLink } from "./inline-tab-link";

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
    <Panel title="Next Up">
      <div className="racer-race-preview stack-sm">
        <div className="racer-section-heading">
          <strong>Next up</strong>
          <p>The next few queue matches.</p>
        </div>
        <div className="list">
          {entries.map((entry) => (
            <div key={entry.id} className="list-row">
              <strong>
                #{entry.position}{" "}
                {entry.racerIds.map((racerId) => resolveRacerName(liveSnapshot, racerId)).join(" vs ")}
              </strong>
              <span>{describeQueueEntry(entry)}</span>
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
