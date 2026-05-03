import type { Dispatch, SetStateAction } from "react";
import type { RacerSummary } from "@shared/types";
import { Panel } from "../ui";
import { removeRacerFromUpcoming, signUpQueue } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";

export function RacersTab({
  filteredRacers,
  search,
  setSearch,
  racerName,
  setRacerName,
  racerEmail,
  setRacerEmail,
  racerPhone,
  setRacerPhone,
  onQuickAddRacer
}: {
  filteredRacers: RacerSummary[];
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  racerName: string;
  setRacerName: Dispatch<SetStateAction<string>>;
  racerEmail: string;
  setRacerEmail: Dispatch<SetStateAction<string>>;
  racerPhone: string;
  setRacerPhone: Dispatch<SetStateAction<string>>;
  onQuickAddRacer: () => void;
}) {
  return (
    <div className="page-grid">
      <Panel title="Quick Add Racer">
        <div className="form-grid">
          <label>
            Name
            <input
              value={racerName}
              onChange={(event) => {
                setRacerName(event.target.value);
              }}
              placeholder="Alex Fast"
            />
          </label>
          <label>
            Email
            <input
              value={racerEmail}
              onChange={(event) => {
                setRacerEmail(event.target.value);
              }}
              placeholder="alex@example.com"
            />
          </label>
          <label>
            Phone
            <input
              value={racerPhone}
              onChange={(event) => {
                setRacerPhone(event.target.value);
              }}
              placeholder="555-0100"
            />
          </label>
          <button
            className="button"
            onClick={() => {
              onQuickAddRacer();
            }}
          >
            Add Racer
          </button>
        </div>
      </Panel>

      <Panel title="Registered Racers">
        <div className="form-row">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Search racers"
          />
        </div>
        <div className="list">
          {filteredRacers.map((entry) => (
            <div key={entry.racer.id} className="list-row">
              <div>
                <strong>{entry.racer.displayName}</strong>
                <p>
                  {entry.stats.races} races · {entry.stats.wins} wins ·{" "}
                  {entry.stats.topSpeedKph.toFixed(1)} km/h top
                </p>
              </div>
              <div className="button-row">
                <button
                  className="button"
                  onClick={() => {
                    fireAndForget(
                      signUpQueue({ racerId: entry.racer.id, requestedType: "auto-match" })
                    );
                  }}
                >
                  Add To Queue
                </button>
                <button
                  className="button button--ghost"
                  onClick={() => {
                    fireAndForget(signUpQueue({ racerId: entry.racer.id, requestedType: "solo" }));
                  }}
                >
                  Solo Run
                </button>
                <button
                  className="button button--ghost"
                  onClick={() => {
                    fireAndForget(removeRacerFromUpcoming(entry.racer.id));
                  }}
                >
                  Remove from Upcoming
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
