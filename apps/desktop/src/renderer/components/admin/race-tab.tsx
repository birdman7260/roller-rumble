import { useRef, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_QUEUE_CLOSED_MESSAGE } from "@roller-rumble/shared/constants";
import type { AppSnapshot, RaceRecord } from "@roller-rumble/shared/types";
import {
  Button,
  EmptyState,
  Panel,
  SearchableSelect,
  StatPill,
  TextInput
} from "@roller-rumble/shared-ui";
import { removeRacerFromQueueEntry, updateSettings } from "../../lib/api";
import { describeQueueEntry, formatRacerNames, resolveRacerName } from "../../lib/snapshot-display";
import { fireAndForget } from "../../lib/ui-actions";

export function RaceTab({
  snapshot,
  settingsTargetDistanceMeters,
  currentRace,
  displayedRaceDistanceInput,
  setRaceDistanceInput,
  onSaveRaceDistance,
  adminQueueRacerId,
  setAdminQueueRacerId,
  adminQueueOpponentId,
  setAdminQueueOpponentId,
  adminQueueRequestedType,
  setAdminQueueRequestedType,
  onAdminQueueSignup
}: {
  snapshot: AppSnapshot;
  settingsTargetDistanceMeters: number;
  currentRace: RaceRecord | null;
  displayedRaceDistanceInput: string;
  setRaceDistanceInput: Dispatch<SetStateAction<string>>;
  onSaveRaceDistance: () => void;
  adminQueueRacerId: string;
  setAdminQueueRacerId: Dispatch<SetStateAction<string>>;
  adminQueueOpponentId: string;
  setAdminQueueOpponentId: Dispatch<SetStateAction<string>>;
  adminQueueRequestedType: "auto-match" | "solo";
  setAdminQueueRequestedType: Dispatch<SetStateAction<"auto-match" | "solo">>;
  onAdminQueueSignup: () => void;
}) {
  const queueRacerSelectId = "admin-queue-racer";
  const queueTypeSelectId = "admin-queue-type";
  const queueOpponentSelectId = "admin-queue-opponent";
  const queueClosedMessageInputRef = useRef<HTMLInputElement>(null);
  const queueOpen = snapshot.settings.queueOpen;
  // Queue entries do not know which race owns them; the current race keeps that link.
  const stagedQueueEntryId =
    currentRace && ["scheduled", "staging", "countdown", "active"].includes(currentRace.state)
      ? currentRace.queueEntryId
      : null;

  return (
    <div className="page-grid">
      <Panel title="Racer Queue Signups">
        <div className="stack-sm">
          <div className="stat-grid">
            <StatPill label="Self-service signups" value={queueOpen ? "Open" : "Closed"} />
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={queueOpen}
              onChange={(event) => {
                fireAndForget(updateSettings({ queueOpen: event.target.checked }));
              }}
            />
            Let racers add themselves to the queue
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={snapshot.settings.allowSoloQueue}
              onChange={(event) => {
                fireAndForget(updateSettings({ allowSoloQueue: event.target.checked }));
              }}
            />
            Let racers queue a solo run
          </label>
          <label htmlFor="admin-queue-closed-message">
            Closed message
            <input
              id="admin-queue-closed-message"
              className="text-input"
              ref={queueClosedMessageInputRef}
              key={snapshot.settings.queueClosedMessage}
              type="text"
              maxLength={200}
              defaultValue={snapshot.settings.queueClosedMessage}
              placeholder={DEFAULT_QUEUE_CLOSED_MESSAGE}
            />
          </label>
          <div className="button-row">
            <Button
              onClick={() => {
                fireAndForget(
                  updateSettings({
                    queueClosedMessage: queueClosedMessageInputRef.current?.value ?? ""
                  })
                );
              }}
            >
              Save Message
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Race Distance">
        <div className="form-row">
          <TextInput
            type="number"
            min="1"
            step="10"
            value={displayedRaceDistanceInput}
            onChange={(event) => {
              setRaceDistanceInput(event.target.value);
            }}
            placeholder="250"
          />
          <Button
            onClick={() => {
              onSaveRaceDistance();
            }}
          >
            Apply Distance
          </Button>
        </div>
        <div className="stat-grid">
          <StatPill label="Configured" value={`${settingsTargetDistanceMeters.toFixed(0)} m`} />
          <StatPill
            label="Current Race"
            value={
              currentRace ? `${currentRace.targetDistanceMeters.toFixed(0)} m` : "No race staged"
            }
          />
        </div>
      </Panel>

      <Panel title="Add To Queue">
        <div className="form-grid">
          <label htmlFor={queueRacerSelectId}>
            Racer
            <SearchableSelect
              id={queueRacerSelectId}
              value={adminQueueRacerId}
              placeholder="Type to find a racer"
              options={snapshot.racers.map((entry) => ({
                value: entry.racer.id,
                label: entry.racer.displayName
              }))}
              onValueChange={(nextRacerId) => {
                setAdminQueueRacerId(nextRacerId);
                if (nextRacerId === adminQueueOpponentId) {
                  setAdminQueueOpponentId("");
                }
              }}
              noResultsText="No racers match that search"
            />
          </label>
          <label htmlFor={queueTypeSelectId}>
            Queue as
            <select
              id={queueTypeSelectId}
              value={adminQueueRequestedType}
              onChange={(event) => {
                const nextType = event.target.value as "auto-match" | "solo";
                setAdminQueueRequestedType(nextType);
                if (nextType === "solo") {
                  setAdminQueueOpponentId("");
                }
              }}
            >
              <option value="auto-match">Auto head-to-head</option>
              <option value="solo">Solo run</option>
            </select>
          </label>
          <label htmlFor={queueOpponentSelectId}>
            Opponent
            <SearchableSelect
              id={queueOpponentSelectId}
              value={adminQueueOpponentId}
              disabled={!adminQueueRacerId || adminQueueRequestedType === "solo"}
              placeholder={
                adminQueueRequestedType === "solo"
                  ? "Solo runs do not need an opponent"
                  : "Type to find an opponent"
              }
              options={snapshot.racers.flatMap((entry) =>
                entry.racer.id === adminQueueRacerId
                  ? []
                  : [
                      {
                        value: entry.racer.id,
                        label: entry.racer.displayName
                      }
                    ]
              )}
              onValueChange={(nextOpponentId) => {
                setAdminQueueOpponentId(nextOpponentId);
              }}
              noResultsText="No racers match that search"
            />
          </label>
          <Button
            disabled={!adminQueueRacerId}
            onClick={() => {
              onAdminQueueSignup();
            }}
          >
            Add To Queue
          </Button>
        </div>
      </Panel>

      <Panel title="Queue">
        {snapshot.queue.length === 0 ? (
          <EmptyState
            title="Queue is clear"
            body="Racers can join from their phones or be added from the racer page."
          />
        ) : (
          <div className="list">
            {snapshot.queue.map((entry) => {
              const isStagedMatch = entry.id === stagedQueueEntryId;

              return (
                <div
                  key={entry.id}
                  className={`list-row queue-list-row${isStagedMatch ? " queue-list-row--staged" : ""}`}
                  aria-current={isStagedMatch ? "true" : undefined}
                >
                  <div>
                    <strong>#{entry.position}</strong>
                    {isStagedMatch ? <span className="queue-status-pill">Staged</span> : null}
                    <p>{formatRacerNames(snapshot, entry.racerIds)}</p>
                    <p>{describeQueueEntry(entry)}</p>
                  </div>
                  <div className="button-row">
                    {entry.racerIds.map((racerId) => (
                      <Button
                        key={racerId}
                        variant="ghost"
                        onClick={() => {
                          fireAndForget(removeRacerFromQueueEntry(entry.id, racerId));
                        }}
                      >
                        Remove {resolveRacerName(snapshot, racerId)}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
