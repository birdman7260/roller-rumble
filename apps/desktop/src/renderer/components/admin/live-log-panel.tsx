import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LiveLogEntry } from "@roller-rumble/shared/types";
import { Button, Panel } from "@roller-rumble/shared-ui";
import { clearLiveLog } from "../../lib/api";
import { liveLogQueryKey, useLiveLogQuery } from "../../lib/query";
import { fireAndForget } from "../../lib/ui-actions";

const SENSOR_PREFIX = "[sensor]";

function timeLabel(at: string): string {
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

function LiveLogLine({ entry }: { entry: LiveLogEntry }) {
  return (
    <div className={`live-log__line live-log__line--${entry.level}`}>
      <span className="live-log__time">{timeLabel(entry.at)}</span> {entry.text}
    </div>
  );
}

/**
 * The app log as it is written, polled every second while following. Lines render newest-first
 * inside a `column-reverse` box, so the view stays pinned to the newest line without any scroll
 * bookkeeping, and scrolling up to read holds still until you come back down.
 */
function LiveLogLines({ entries, error }: { entries: LiveLogEntry[]; error: Error | null }) {
  if (error) {
    return <p className="form-error">{error.message}</p>;
  }
  return (
    <div className="live-log" role="log" aria-live="off">
      {entries.length ? (
        [...entries].reverse().map((entry) => <LiveLogLine key={entry.id} entry={entry} />)
      ) : (
        <div className="live-log__line">Nothing logged yet.</div>
      )}
    </div>
  );
}

/** The app log, live, with follow/pause, a sensor-only filter, and a clear button. */
export function LiveLogPanel() {
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(true);
  const [sensorOnly, setSensorOnly] = useState(false);
  const [clearing, setClearing] = useState(false);
  const logQuery = useLiveLogQuery(following);

  const entries = logQuery.data?.entries ?? [];
  const shown = sensorOnly
    ? entries.filter((entry) => entry.text.includes(SENSOR_PREFIX))
    : entries;

  async function clear(): Promise<void> {
    if (
      !window.confirm(
        "Clear the app log? This also empties the log file, so a diagnostics bundle saved afterwards starts from here."
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      queryClient.setQueryData(liveLogQueryKey, await clearLiveLog());
    } finally {
      setClearing(false);
    }
  }

  return (
    <Panel
      className="settings-panel"
      title="Live log"
      actions={
        <div className="panel-action-row settings-panel__actions">
          <Button variant="ghost" onClick={() => setFollowing((value) => !value)}>
            {following ? "Pause" : "Follow"}
          </Button>
          <Button
            variant="ghost"
            disabled={clearing}
            onClick={() => fireAndForget(clear(), "clear live log")}
          >
            {clearing ? "Clearing…" : "Clear log"}
          </Button>
        </div>
      }
    >
      <div className="stack-sm">
        <label className="live-log__filter">
          <input
            type="checkbox"
            checked={sensorOnly}
            onChange={(event) => setSensorOnly(event.target.checked)}
          />
          Only sensor lines ({SENSOR_PREFIX})
        </label>
        <p className="managed-field__description">
          {following ? "Following" : "Paused"} · showing {shown.length} of the newest{" "}
          {entries.length} lines. Turn on Log raw sensor data to see every line the box sends.
        </p>
        <LiveLogLines entries={shown} error={logQuery.error} />
      </div>
    </Panel>
  );
}
