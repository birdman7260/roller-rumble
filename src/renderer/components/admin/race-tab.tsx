import type { Dispatch, SetStateAction } from "react";
import type { AppSnapshot, RaceRecord } from "@shared/types";
import { EmptyState, Panel, SearchableSelect, StatPill } from "../ui";
import { removeRacerFromQueueEntry } from "../../lib/api";
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
  return (
    <div className="page-grid">
      <Panel title="Race Distance">
        <div className="form-row">
          <input
            type="number"
            min="1"
            step="10"
            value={displayedRaceDistanceInput}
            onChange={(event) => {
              setRaceDistanceInput(event.target.value);
            }}
            placeholder="250"
          />
          <button
            className="button"
            onClick={() => {
              onSaveRaceDistance();
            }}
          >
            Apply Distance
          </button>
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
          <label>
            Racer
            <SearchableSelect
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
          <label>
            Queue as
            <select
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
          <label>
            Opponent
            <SearchableSelect
              value={adminQueueOpponentId}
              disabled={!adminQueueRacerId || adminQueueRequestedType === "solo"}
              placeholder={
                adminQueueRequestedType === "solo"
                  ? "Solo runs do not need an opponent"
                  : "Type to find an opponent"
              }
              options={snapshot.racers
                .filter((entry) => entry.racer.id !== adminQueueRacerId)
                .map((entry) => ({
                  value: entry.racer.id,
                  label: entry.racer.displayName
                }))}
              onValueChange={(nextOpponentId) => {
                setAdminQueueOpponentId(nextOpponentId);
              }}
              noResultsText="No racers match that search"
            />
          </label>
          <button
            className="button"
            disabled={!adminQueueRacerId}
            onClick={() => {
              onAdminQueueSignup();
            }}
          >
            Add To Queue
          </button>
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
            {snapshot.queue.map((entry) => (
              <div key={entry.id} className="list-row">
                <div>
                  <strong>#{entry.position}</strong>
                  <p>{formatRacerNames(snapshot, entry.racerIds)}</p>
                  <p>{describeQueueEntry(entry)}</p>
                </div>
                <div className="button-row">
                  {entry.racerIds.map((racerId) => (
                    <button
                      key={racerId}
                      className="button button--ghost"
                      onClick={() => {
                        fireAndForget(removeRacerFromQueueEntry(entry.id, racerId));
                      }}
                    >
                      Remove {resolveRacerName(snapshot, racerId)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
